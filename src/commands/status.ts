import { Command } from '@sapphire/framework';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { config, mwUrls } from '#src/config';
import { isRealError } from '#src/util';

export class StatusCommand extends Command {
  public override async chatInputRun(interaction: CommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();
      const statusResults = await this.checkUrlsStatus(mwUrls);

      const embeds = this.createEmbeds(statusResults);
      // Uncomment the next line if you use components
      // const components = this.createComponents();

      await interaction.editReply({ embeds /*, components*/ });
    } catch (ex) {
      if (isRealError(ex as Error)) {
        console.error('Error in StatusCommand:', ex);
        await interaction.followUp('An error occurred while processing your request.');
      }
    }
  }

  private async checkUrlsStatus(urls: string[]): Promise<string[]> {
    return Promise.all(urls.map(async (url) => {
      try {
        const response = await fetch(url);
        return `${response.ok ? `🟢 UP` : '🔴 DOWN'} - [${url}](${url})`;
      } catch (error) {
        console.error('Error checking URL:', url, error);
        return `🔴 DOWN (Error) - [${url}](${url})`;
      }
    }));
  }

  private createEmbeds(statusResults: string[]): EmbedBuilder[] {
    const exampleEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Movie-Web Status')
      .setURL('https://movie-web.app') // Replace with your website or relevant link
      .setAuthor({ 
        name: 'Movie-Web Bot', 
        iconURL: 'https://avatars.githubusercontent.com/u/121455091?s=200&v=4', // Replace with your bot's icon URL
        url: 'https://movie-web.app' // Replace with your website or relevant link
      })
      .setDescription('Current status of Movie-Web URLs')
      .setThumbnail(this.container.client.user?.displayAvatarURL() ?? config.mwIconUrl)
      .addFields(statusResults.map(status => ({ name: '\u200B', value: status })))
      .setTimestamp()
      .setFooter({ 
        text: 'Status checked at', 
        iconURL: 'https://avatars.githubusercontent.com/u/121455091?s=200&v=4' // Optional: Footer icon URL
      });

    return [exampleEmbed];
  }



  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('status')
        .setDescription('Check the status of Movie-Web sites'),
    );
  }
}
