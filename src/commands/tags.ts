import { Command } from '@sapphire/framework';
import {
  ActionRowBuilder,
  ApplicationCommandType,
  AutocompleteInteraction,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageComponentInteraction,
  MessageContextMenuCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';

import { tagCache } from '#src/config';
import { constructTagButtons, isRealError } from '#src/util';

export class TagsCommand extends Command {
  public override async contextMenuRun(interaction: MessageContextMenuCommandInteraction) {
    try {
      if (!interaction.isMessageContextMenuCommand && !(interaction.targetMessage instanceof Message)) return;

      const options = Array.from(tagCache)
        .filter(([_key, value]) => value.isContextEnabled)
        .map(([key]) => ({ label: key, value: key }));

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
      let replyOptions: BaseMessageOptions | undefined;

      collector?.on('collect', async (i) => {
        await i.deferUpdate();

        if (i.customId === 'tag_select') {
          if (!i.isStringSelectMenu()) return;
          const tag = i.values[0];
          if (!tag) return;

          const selectedTag = tagCache.get(tag);
          if (!selectedTag) return;

          replyOptions = {
            content: `${selectedTag.content}\nSent by ${interaction.user}`,
            embeds: selectedTag.embeds,
            components: constructTagButtons(selectedTag.urls),
            allowedMentions: { repliedUser: true },
          };
        }

        if (i.customId === 'tag_cancel') {
          await interaction.deleteReply();
          return collector.stop();
        }

        if (i.customId === 'tag_confirm') {
          if (!replyOptions) return;

          await interaction.deleteReply();
          await interaction.targetMessage.reply(replyOptions);
          return collector.stop();
        }
      });
    } catch (ex) {
      if (isRealError(ex as Error)) {
        throw ex;
      }
    }
  }

  public override async chatInputRun(interaction: CommandInteraction) {
    try {
      if (!interaction.isChatInputCommand()) return;

      const tagKey = interaction.options.getString('key', true);
      const user = interaction.options.getUser('mention');
      const tag = tagCache.get(tagKey);

      if (!tag) return interaction.reply({ content: 'Tag not found', ephemeral: true });
      return interaction.reply({
        content: `${user ? `${user}\n` : ''}${tag.content}`,
        embeds: tag.embeds,
        components: constructTagButtons(tag.urls),
      });
    } catch (ex) {
      if (isRealError(ex as Error)) {
        throw ex;
      }
      return undefined;
    }
  }

  public override async autocompleteRun(interaction: AutocompleteInteraction) {
    try {
      if (interaction.commandName !== 'tag') return;
      const { name, value } = interaction.options.getFocused(true);
      if (name !== 'key') return;

      const response = Array.from(tagCache.keys())
        .filter((key: string) => key.includes(value))
        .map((key: string) => ({ name: key, value: key }));

      await interaction.respond(response);
    } catch (ex) {
      if (isRealError(ex as Error)) {
        throw ex;
      }
    }
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerContextMenuCommand((builder) =>
      builder //
        .setName('Send Tag')
        .setType(ApplicationCommandType.Message),
    );
    registry.registerChatInputCommand((builder) =>
      builder //
        .setName('tag')
        .setDescription('send a tag')
        .addStringOption((option) =>
          option //
            .setName('key')
            .setDescription('the tag to send')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option //
            .setName('mention')
            .setDescription('the user to mention'),
        ),
    );
  }
}
