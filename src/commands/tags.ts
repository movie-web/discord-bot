import { Command } from '@sapphire/framework';
import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  Message,
  MessageComponentInteraction,
  MessageContextMenuCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';

import { tagCache } from '#src/config';

export class TagsCommand extends Command {
  public override async contextMenuRun(interaction: MessageContextMenuCommandInteraction) {
    if (!interaction.isMessageContextMenuCommand && !(interaction.targetMessage instanceof Message)) return;
    const { author } = interaction.targetMessage;
    const options = [...tagCache.keys()].map((key) => ({ label: key, value: key }));

    const selectMenuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tag_select')
        .setOptions(options)
        .setPlaceholder('Select a tag')
        .setMinValues(1)
        .setMaxValues(1),
    );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tag_confirm').setStyle(ButtonStyle.Primary).setLabel('Confirm'),
      new ButtonBuilder().setCustomId('tag_cancel').setStyle(ButtonStyle.Secondary).setLabel('Cancel'),
    );

    await interaction.reply({ components: [selectMenuRow, buttonRow], ephemeral: true });

    const filter = (i: MessageComponentInteraction) => i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 15000 });
    let content: string | undefined;

    collector?.on('collect', async (i) => {
      await i.deferUpdate();

      if (i.customId === 'tag_select') {
        if (!i.isStringSelectMenu()) return;
        const tag = i.values[0];
        if (!tag) return;

        const selectedTag = tagCache.get(tag);
        if (!selectedTag) return;

        content = `${author}\n${selectedTag}`;
      }

      if (i.customId === 'tag_cancel') {
        await interaction.deleteReply();
        return collector.stop();
      }

      if (i.customId === 'tag_confirm') {
        if (!content) return;

        await interaction.deleteReply();
        await i.followUp({ content, ephemeral: false });
        return collector.stop();
      }
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerContextMenuCommand((builder) =>
      builder //
        .setName('Send Tag')
        .setType(ApplicationCommandType.Message),
    );
  }
}
