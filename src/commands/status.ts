import { Command } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteraction } from 'discord.js';

import { mwUrls } from '#src/config';
import { isRealError } from '#src/util';

export class StatusCommand extends Command {
  public override async chatInputRun(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      const description = await Promise.all(
        mwUrls.map(async (url) => {
          const response = await fetch(`${url.trim()}/ping.txt`).catch(() => null);
          const text = response ? await response.text() : '';
          const ok = text.trim() === 'pong';
          return `${ok ? '🟢 UP' : '🔴 DOWN'} **${url.trim()}**`;
        }),
      ).then((lines) => lines.join('\n'));

      const embeds = [
        {
          title: 'mw status',
          description,
          thumbnail: {
            url: this.container.client.user!.displayAvatarURL(),
          },
          color: 0xa87fd1,
        },
      ];

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Instance Info')
          .setEmoji('ℹ️')
          .setStyle(ButtonStyle.Link)
          .setURL('https://movie-web.github.io/docs/instances#community-instances'),
      );

      await interaction.editReply({ embeds, components: [row] });
    } catch (ex) {
      if (isRealError(ex as Error)) {
        throw ex;
      }
    }
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder //
        .setName('status')
        .setDescription('movie-web status'),
    );
  }
}
