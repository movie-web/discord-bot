import { Command } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteraction, EmbedBuilder } from 'discord.js';
import axios from 'axios'; // Assuming axios is used for HTTP requests

import pkg from '#package.json' assert { type: 'json' };
import { config } from '#src/config';
import { isRealError } from '#src/util';

export class InfoCommand extends Command {
  public override async chatInputRun(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      // Function to measure response time
      const getResponseTime = async () => {
        const start = Date.now();
        await axios.get('https://movie-web.app');
        const end = Date.now();
        return end - start;
      };

      // Get the response time
      const responseTime = await getResponseTime();

      // Using EmbedBuilder for better formatting and structuring
      const embed = new EmbedBuilder()
        .setTitle('mw-bot Info')
        .setDescription(`Version: ${pkg.version}`)
        .setThumbnail(this.container.client.user?.displayAvatarURL() ?? config.mwIconUrl)
        .setColor(0xa87fd1)
        .addFields([
          { name: 'Website Response Time', value: `${responseTime} ms` },
          // more field maybe
        ])
        .setTimestamp()
        .setFooter({ text: 'mw-bot', iconURL: this.container.client.user?.displayAvatarURL() });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Discord').setStyle(ButtonStyle.Link).setURL('https://discord.movie-web.app/'),
        new ButtonBuilder()
          .setLabel('GitHub')
          .setStyle(ButtonStyle.Link)
          .setURL('https://github.com/movie-web/movie-web'),
        new ButtonBuilder().setLabel('movie-web.app').setStyle(ButtonStyle.Link).setURL('https://movie-web.app'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (ex) {
      if (isRealError(ex as Error)) {
        throw ex;
      }
    }
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder //
        .setName('info')
        .setDescription('info about mw-bot'),
    );
  }
}
