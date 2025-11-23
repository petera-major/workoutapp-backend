const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn(
    "the /api/generate-workout-plan route will fail."
  );
}

app.use(cors());
app.use(express.json());

function buildPrompt({ goal, experience, style, daysPerWeek }) {
  return `
    You are a professional strength & conditioning coach creating a safe, realistic workout plan.

    User profile:
    - Goal: ${goal}
    - Experience level: ${experience}
    - Preferred workout style: ${style}
    - Days per week: ${daysPerWeek}
    - Duration: 6–8 weeks total

    Requirements:
    1. Create a structured training plan that lasts 6 weeks by default (you may go up to 8 if it makes sense).
    2. Use the specified number of training days per week (${daysPerWeek}) and fill each day with an appropriate workout.
    3. Match intensity and complexity to the user's experience level.
    4. Respect the style (e.g., Weightlifting, Pilates, HIIT, Cardio, Outdoor, Home Workouts).
    5. Include rest or active recovery days where appropriate.
    6. Avoid unsafe volume or crazy supersets. Assume normal healthy adult with no injuries.

    Return ONLY valid JSON with this exact shape (no extra text):

    {
    "weekCount": number,
    "daysPerWeek": number,
    "summary": {
        "title": string,
        "description": string,
        "notes": string
    },
    "weeks": [
        {
        "weekNumber": number,
        "focus": string,
        "days": [
            {
            "id": string,
            "dayName": string,
            "title": string,
            "focus": string,
            "durationMinutes": number,
            "exerciseCount": number,
            "style": string,
            "experience": string,
            "exercises": [
                {
                "name": string,
                "sets": number,
                "reps": string,
                "equipment": string,
                "notes": string
                }
            ]
            }
        ]
        }
    ]
    }
    `;
}

app.post("/api/generate-workout-plan", async (req, res) => {
  try {
    const { goal, experience, style, daysPerWeek } = req.body || {};

    if (!goal || !experience || !style || !daysPerWeek) {
      return res.status(400).json({
        error:
          "Missing required fields. Expect goal, experience, style, daysPerWeek.",
      });
    }

    if (!OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured on the server." });
    }

    const prompt = buildPrompt({
      goal,
      experience,
      style,
      daysPerWeek,
    });

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful fitness coach that responds ONLY with valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.8,
        }),
      }
    );

    if (!openAiResponse.ok) {
      const text = await openAiResponse.text();
      console.error("OpenAI error:", text);
      return res.status(502).json({
        error: "Failed to generate workout plan from AI.",
        details: text,
      });
    }

    const data = await openAiResponse.json();
    const content =
      data.choices?.[0]?.message?.content || "{}";

    let plan;
    try {
      plan = JSON.parse(content);
    } catch (err) {
      console.error("JSON parse error from OpenAI:", err, content);
      return res.status(500).json({
        error: "AI response was not valid JSON.",
      });
    }

    // Optional: sanity checks / fallback
    if (!Array.isArray(plan.weeks)) {
      return res.status(500).json({
        error: "Workout plan missing 'weeks' array in AI response.",
      });
    }

    // Success
    res.json({
      ok: true,
      plan,
    });
  } catch (err) {
    console.error("Server error in /api/generate-workout-plan:", err);
    res.status(500).json({
      error: "Unexpected server error.",
    });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "flexyn-workout-backend" });
});

app.listen(PORT, () => {
  console.log(`Flexyn backend running on http://localhost:${PORT}`);
});
