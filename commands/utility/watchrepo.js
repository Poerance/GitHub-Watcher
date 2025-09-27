const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { guildId, categoryId } = require("../../config.json");
const fetch = require("node-fetch");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("watchrepo")
        .setDescription("Watch a GitHub repo for new releases.")
        .setDefaultMemberPermissions(0)
        .addStringOption(option =>
            option.setName("repo_link")
                .setDescription("GitHub repository link")
                .setRequired(true)),
    async execute(interaction, db) {
        // Only server owner
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: "🚫 Only the **server owner** can use this command.",
                ephemeral: true
            });
        }

        const repoLink = interaction.options.getString("repo_link");
        const client = interaction.client; // get client from interaction

        // Validate GitHub URL
        if (!/^https:\/\/github.com\/[^\/]+\/[^\/]+$/.test(repoLink)) {
            return interaction.reply({
                content: "Invalid GitHub repo URL!",
                flags: 1 << 6 // ephemeral
            });
        }

        const existing = await db.get(`SELECT channel_id FROM watched_repos WHERE repo_url = ?`, repoLink);

        if (existing) {
            return interaction.reply({
                content: `⚠️ This repo is already being watched in <#${existing.channel_id}>`,
                flags: 1 << 6
            });
}

        // Fetch repo name via API
        let repoName;
        let repoDescription;
        try {
            const res = await fetch(repoLink.replace("https://github.com/", "https://api.github.com/repos/"));
            if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
            const data = await res.json();
            repoName = data.full_name.replace(/\//g, "-"); // owner-repo format
            repoDescription = data.description;
        } catch (err) {
            console.error("Failed to fetch repo name:", err);
            return interaction.reply({
                content: "Failed to fetch repo name from GitHub API.",
                flags: 1 << 6 // ephemeral
            });
        }

        // Create guild reference
        const guild = await client.guilds.fetch(guildId);

        // Create new private channel in category
        const newChannel = await guild.channels.create({
            name: repoName,
            type: 0, // GuildText
            topic: repoDescription,
            parent: categoryId
        });

        // Create button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_channel")
                .setLabel("Close")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)
        );

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle("🔔 Repo Watcher Activated")
            .setDescription(`This channel is now watching **${repoLink.replace("https://github.com/", "")}**\nPress ❌ below to close this channel.`)
            .setColor("Green")
            .setTimestamp()
            .addFields(
                {name: "Repository", value: `[${repoLink.replace("https://github.com/", "")}](${repoLink})`, inline: false}
            );

        const sentMessage = await newChannel.send({
            embeds: [embed],
            components: [row]
        });

        await sentMessage.pin();

        // Store or update in DB
        await db.run(`
            INSERT INTO watched_repos(repo_url, repo_name, channel_id, last_release)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(repo_url) DO UPDATE SET channel_id = excluded.channel_id
        `, repoLink, repoLink.replace("https://github.com/", ""), newChannel.id, null);

        // Reply to user
        await interaction.reply({
            content: `> Now watching [${repoLink.replace("https://github.com/", "")}](${repoLink}) in <#${newChannel.id}>`,
            flags: 1 << 6 // ephemeral
        });
    }
};
