const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const fetch = require("node-fetch");
const { token } = require("./config.json");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, "commands/utility");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
}

// SQLite DB
let db;
(async () => {
    db = await open({ filename: './database.sqlite', driver: sqlite3.Database });
    await db.run(`
        CREATE TABLE IF NOT EXISTS watched_repos (
            repo_url TEXT PRIMARY KEY,
            repo_name TEXT,
            channel_id TEXT,
            last_release TEXT
        )
    `);
})();

// Ready event
client.once("clientReady", () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    startPolling();
});

// Slash command and Button handler
client.on("interactionCreate", async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === "close_channel") {
            await db.run(`DELETE FROM watched_repos WHERE channel_id = ?`, interaction.channel.id);
            // Delete channel
            await interaction.reply({ content: "🔒 Closing this channel...", flags: 1 << 6 });
            await interaction.channel.delete().catch(console.error);
        }
    }

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, db, client);
        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: "❌ Error executing command.", flags: 1 << 6 });
            } else {
                await interaction.reply({ content: "❌ Error executing command.", flags: 1 << 6 });
            }
        }
    }
});


// Polling interval
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function startPolling() {
    setInterval(async () => {
        const repos = await db.all("SELECT * FROM watched_repos");
        for (const repo of repos) {
            try {
                // Fetch latest release
                const apiReleaseUrl = repo.repo_url.replace("https://github.com/", "https://api.github.com/repos/") + "/releases/latest";
                const res = await fetch(apiReleaseUrl);
                if (!res.ok) continue;
                const data = await res.json();

                if (data.tag_name && data.tag_name !== repo.last_release) {
                    // Update DB
                    await db.run("UPDATE watched_repos SET last_release = ? WHERE repo_url = ?", data.tag_name, repo.repo_url);

                    // Send message
                    const channel = await client.channels.fetch(repo.channel_id);
                    if (channel) {
                        // await channel.send(`📢 New release for ${repo.repo_url}: **${data.tag_name}**\n${data.html_url}`);

                        const embed = new EmbedBuilder()
                            .setTitle(`📢 New Release: ${data.tag_name}`)
                            .setURL(data.html_url)
                            .setColor(0x00AE86)
                            .setFooter({ text: "GitHub Watcher" })
                            .addFields(
                                { name: "Repository", value: `[${repo.repo_name}](${repo.repo_url})`, inline: true },
                                { name: "Released At", value: new Date(data.published_at || Date.now()).toLocaleString("en-GB", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    day: "2-digit",
                                    month: "long",
                                    year: "numeric"
                                }), inline: true },
                                { name: "Release Page", value: data.html_url, inline: false }
                            );

                            await channel.send({ embeds: [embed] });
                    }
                }
            } catch (err) {
                console.error(`Error checking ${repo.repo_url}:`, err);
            }
        }
    }, POLL_INTERVAL);
}

client.login(token);
