// Stand-in for the DeepSeek API (OpenAI-compatible) for local tests. Records what it is sent.
// It returns the sample CV's structure plus one invented employer and skill, to prove they get removed.
const http = require("node:http");
const fs = require("node:fs");
const expected = JSON.parse(fs.readFileSync("tests/fixtures/sample_cv.expected.json", "utf8"));
const reply = { ...expected, name: "", email: "", phone: "", location: "" };
reply.skills = [...expected.skills.slice(0, 8), "Kubernetes"];
reply.experience = [...expected.experience, { title: "CTO", company: "Google", dates: "2010 - 2018", bullets: ["Ran everything"] }];
const requests = [];
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/requests") return res.end(JSON.stringify(requests));
      if (req.url === "/reset") return res.end(JSON.stringify({ cleared: requests.splice(0).length }));
      requests.push({ url: req.url, auth: req.headers.authorization, body });
      // Eligibility checks (matching) get a verdict; everything else gets the CV structure.
      let content = JSON.stringify(reply);
      if (body.includes("CV TO TAILOR")) {
        // Tailoring: mostly honest, with one invented skill and one invented bullet slipped in.
        // For the "Python Developer (Contract)" job the reply is almost all invented, to exercise the fallback.
        const prompt = JSON.parse(body).messages[1].content;
        content = /Title: Python Developer \(Contract\)/.test(prompt)
          ? JSON.stringify({ summary: "World-class architect.", skills: ["Kubernetes", "Rust", "Go"], experience: [{ id: "E9", title: "CTO", company: "Google", bullets: ["Ran everything"] }, { id: "E1", bullets: ["Built a rocket", "Cured a disease"] }] })
          : JSON.stringify({
              summary: "Backend developer with 5 years of experience building Python web services and data pipelines.",
              skills: ["AWS", "Docker", "Kubernetes", "PostgreSQL"],
              experience: [
                { id: "E1", bullets: ["Cut AWS costs by 30% by moving batch jobs to Docker on ECS", "Built REST APIs in Python and Flask serving 2 million requests per day", "Launched a blockchain platform used by 9 banks"] },
                { id: "E2", bullets: ["Automated testing with pytest, cutting release time by 40%", "Developed SQL reporting pipelines in PostgreSQL"] },
              ],
            });
      } else if (body.includes("JOB ADVERT")) {
        content = /Title: Software Developer/.test(JSON.parse(body).messages[1].content)
          ? JSON.stringify({ eligible: false, adjustment: -5, reason: "Advert requires active security clearance." })
          : JSON.stringify({ eligible: true, adjustment: 0, reason: "Level and contract type fit." });
      }
      res.end(
        JSON.stringify({
          id: "x", object: "chat.completion", model: "fake-model",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
          usage: { prompt_tokens: 321, completion_tokens: 123, total_tokens: 444 },
        }),
      );
    });
  })
  .listen(4010, () => console.log("fake AI on 4010"));
