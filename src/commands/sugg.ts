// - wade5 was here
// command here is for suggestions in the server 
// or you can make one for the website also 0 where you can make a suggestion for the website and sends it to discord 
import { Command } from '@sapphire/framework';
import { CommandInteraction, TextChannel, EmbedBuilder } from 'discord.js';
import { isRealError } from '#src/util';

export class SuggestionCommand extends Command {
  public override async chatInputRun(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      const suggestionOption = interaction.options.get('suggestion');
      if (!suggestionOption || typeof suggestionOption.value !== 'string') {
        await interaction.editReply('Please provide a suggestion.');
        return;
      }
      const suggestion = suggestionOption.value;

      // Replace 'YOUR_CHANNEL_ID' with the ID of the channel where you want to post the message
      const targetChannelId = '1163636277262958679';
      const targetChannel = await interaction.guild?.channels.fetch(targetChannelId) as TextChannel;

      if (!targetChannel) {
        await interaction.editReply('Target channel not found.');
        return;
      }

      // Embed for the target channel
      const channelEmbed = new EmbedBuilder()
        .setColor(0xa87fd1)
        .setTitle('New Suggestion Received')
        .setDescription(suggestion)
        .setFooter({ text: `Suggestion by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await targetChannel.send({ embeds: [channelEmbed] });

      // Embed for confirmation reply to the user
      const replyEmbed = new EmbedBuilder()
        .setColor(0xa87fd1)
        .setTitle('Suggestion Sent')
        .setDescription('Your suggestion has been sent to the team. Thank you!')
        .setTimestamp();

      await interaction.editReply({ embeds: [replyEmbed] });
    } catch (ex) {
      if (isRealError(ex as Error)) {
        throw ex;
      }
      const errorEmbed = new EmbedBuilder()
        .setColor(0xa87fd1)
        .setTitle('Error')
        .setDescription('An error occurred while processing your request.')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(builder =>
      builder
        .setName('suggest')
        .setDescription('Send a suggestion to the team for consideration')
        .addStringOption(option =>
          option
            .setName('suggestion')
            .setDescription('Your suggestion')
            .setRequired(true)
        )
    );
  }
}
