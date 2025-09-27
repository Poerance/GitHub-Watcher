const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { clientId, guildId, token } = require("./config.json");

const commands = [];
const commandsPath = path.join(__dirname, "commands/utility");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
    try {
        console.log(`Refreshing ${commands.length} commands...`);
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log("Commands deployed successfully!");
    } catch (error) {
        console.error(error);
    }
})();
