const jsonServer = require("json-server");
const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const server = express();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();
const port = process.env.PORT || 8080;

server.use(express.json());
server.use(middlewares);

// GitHub API details
const GITHUB_API_URL = "https://api.github.com/repos/bankaihekai/mbdata/contents/db.json";
const binKey = "67d9878c8a456b7966787549";
const masterKey = "$2a$10$Mya1QQvt8foHg2AaLxkgaeZ2mRJ4HnwVKlD4ElQkL3TvUl94sJtau";

async function getGITtoken() {
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${binKey}/latest`, {
      method: "GET",
      headers: {
        "X-Master-Key": masterKey
      }
    });

    if (!response.ok) throw new Error("Failed to fetch GitHub token");

    const data = await response.json();

    if (data.record && data.record[0] && data.record[0].classic) {
      return data.record[0].classic;
    } else {
      throw new Error("GitHub token not found in JSONBin");
    }
  } catch (error) {
    console.error("Error fetching GitHub Token:", error);
    return null;
  }
}

async function updateGitHubJson(newData) {
  try {
    const GITHUB_TOKEN = await getGITtoken();
    if (!GITHUB_TOKEN) throw new Error("GitHub token is missing");

    // Get existing file from GitHub to retrieve its SHA
    const existingFile = await fetch(GITHUB_API_URL, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    }).then(res => res.json());

    if (!existingFile.sha) throw new Error("Failed to fetch GitHub SHA");

    // Convert new JSON data to base64
    const updatedContent = Buffer.from(JSON.stringify(newData, null, 2)).toString("base64");

    // Commit the update
    const result = await fetch(GITHUB_API_URL, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Updated db.json via API",
        content: updatedContent,
        sha: existingFile.sha
      })
    });

    return result.json();
  } catch (error) {
    console.error("Error updating GitHub:", error);
    throw error;
  }
}

// Helper function to read and write db.json
function getDbData() {
  return JSON.parse(fs.readFileSync("db.json", "utf-8"));
}

async function saveDbData(data) {
  fs.writeFileSync("db.json", JSON.stringify(data, null, 2));
  await updateGitHubJson(data);
}

// Intercept all write requests (POST, PATCH, DELETE)
server.use(async (req, res, next) => {
  try {
    if (["POST", "PATCH", "DELETE"].includes(req.method)) {
      const data = getDbData();
      const { users } = data;

      if (req.method === "POST") {
        const newUser = req.body;
        newUser.id = users.length + 1; // Assign a unique ID
        users.push(newUser);
      } else if (req.method === "PATCH") {
        const userIndex = users.findIndex(user => user.id === req.body.id);
        if (userIndex !== -1) {
          users[userIndex] = { ...users[userIndex], ...req.body };
        }
      } else if (req.method === "DELETE") {
        const userId = parseInt(req.url.split("/").pop(), 10);
        data.users = users.filter(user => user.id !== userId);
      }

      await saveDbData(data);
    }

    next(); // Proceed to json-server
  } catch (error) {
    res.status(500).json({ error: "Failed to update GitHub" });
  }
});

// json-server router
server.use(router);

server.listen(port, () => {
  console.log(`JSON Server is running on port ${port}`);
});
