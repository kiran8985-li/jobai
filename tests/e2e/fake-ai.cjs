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
      if (body.includes("JOB ADVERT")) {
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
