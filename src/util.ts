import {
  ScrapeMedia,
  SourcererOptions,
  flags,
  getBuiltinSources,
  makeProviders,
  makeStandardFetcher,
  targets,
} from '@movie-web/providers';
import {
  IChatInputCommandPayload,
  IContextMenuCommandPayload,
  InteractionHandlerError,
  InteractionHandlerParseError,
  ListenerErrorPayload,
} from '@sapphire/framework';
import {
  APIEmbed,
  ActionRowBuilder,
  ApplicationCommandOptionChoiceData,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Collection,
  CommandInteraction,
  DiscordAPIError,
  GuildEmoji,
  HTTPError,
  RESTJSONErrorCodes,
} from 'discord.js';
import { Counter } from 'prom-client';
import { MovieDetails, TMDB, TvShowDetails } from 'tmdb-ts';

import { SourceType, Status, TagUrlButtonData, config, mwUrls, statusEmojiIds } from '#src/config';

const tmdb = new TMDB(config.tmdbApiKey);

export async function searchTitle(query: string): Promise<ApplicationCommandOptionChoiceData[]> {
  try {
    const rawResults = await tmdb.search.multi({ query, page: 1, include_adult: false });
    const results = rawResults.results.filter((result) => result.media_type === 'tv' || result.media_type === 'movie');

    if (!results.length) return [{ name: 'No results found', value: 'empty' }];

    return results.slice(0, 25).map((result) => {
      const identifier = `${result.media_type}:${result.id}`;
      if (result.media_type === 'tv') {
        return { name: `${result.name} (${new Date(result.first_air_date).getFullYear()})`, value: identifier };
      }
      if (result.media_type === 'movie') {
        return { name: `${result.title} (${new Date(result.release_date).getFullYear()})`, value: identifier };
      }
      return { name: 'No results found', value: 'empty' };
    });
  } catch (ex) {
    return [{ name: 'No results found', value: 'empty' }];
  }
}

export async function fetchMedia(
  identifier: string,
): Promise<{ type: 'movie' | 'tv'; result: TvShowDetails | MovieDetails } | undefined> {
  try {
    const [type, id] = identifier.split(':');
    if (id === 'empty') return;

    let result: TvShowDetails | MovieDetails;

    switch (type) {
      case 'tv':
        result = await tmdb.tvShows.details(parseInt(id, 10));
        break;
      case 'movie':
        result = await tmdb.movies.details(parseInt(id, 10));
        break;
      default:
        return undefined;
    }

    return { type, result };
  } catch (ex) {
    console.log(ex);
    return undefined;
  }
}

export async function checkAvailability(
  media: ScrapeMedia,
  posterPath: string,
  interaction: CommandInteraction,
): Promise<void> {
  const cache = new CacheCollection();

  cache.setMedia(media);
  cache.setPosterPath(posterPath);

  const sourceTypeMap: Map<string, Source> = new Map();

  const providers = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.ANY,
    consistentIpForRequests: true,
  });

  const sources = getBuiltinSources();

  for (const source of sources) {
    const sourceType = determineSourceType(source);
    sourceTypeMap.set(source.id, { id: source.id, type: sourceType, rank: source.rank });
  }

  const sortedSourcesWithType = Array.from(sourceTypeMap.values()).sort((a, b) => b.rank - a.rank);
  cache.setSources(sortedSourcesWithType);

  cache.setStatus(sortedSourcesWithType.map((s) => ({ id: s.id, status: Status.WAITING })));
  await makeResponseEmbed(cache, interaction);

  const allSources = providers.listSources();
  const sourceResults = [];
  const embedResults = [];

  for (const source of allSources) {
    const status = cache.getStatus();
    if (!status) return;
    const sourceStatus = status.find((s) => s.id === source.id);
    if (!sourceStatus) return;
    sourceStatus.status = Status.LOADING;

    cache.setStatus(status);
    await makeResponseEmbed(cache, interaction);

    const timeoutPromise = timeout(10000).then(() => undefined);

    const sourceResultPromise = providers
      .runSourceScraper({
        id: source.id,
        media,
      })
      .catch(() => undefined);

    const sourceResult = await Promise.race([sourceResultPromise, timeoutPromise]).catch(() => undefined);

    if (sourceResult) {
      sourceResults.push(sourceResult);
      sourceStatus.status = Status.SUCCESS;

      for (const embed of sourceResult.embeds) {
        const embedResultPromise = providers
          .runEmbedScraper({
            id: embed.embedId,
            url: embed.url,
          })
          .catch(() => undefined);

        const embedResult = await Promise.race([embedResultPromise, timeoutPromise]).catch(() => undefined);

        if (embedResult) {
          embedResults.push(embedResult);
        } else {
          sourceStatus.status = Status.FAILURE;
        }
      }
    } else {
      sourceStatus.status = Status.FAILURE;
    }

    cache.setStatus(status);
    await makeResponseEmbed(cache, interaction);
  }

  const status = cache.getStatus();

  if (status) {
    status.forEach((s) => {
      if (s.status === Status.LOADING) s.status = Status.SUCCESS;
    });
    cache.setStatus(status);
  }

  const numberOfSuccesses = status?.filter((s) => s.status === Status.SUCCESS).length ?? 0;

  if (numberOfSuccesses > 0) {
    const button = new ButtonBuilder()
      .setLabel('🎞️ Watch on movie-web')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('watch_on_movie_web');

    const actionRow = new ActionRowBuilder<ButtonBuilder>().setComponents(button);

    const urlStatuses = await Promise.all(
      mwUrls.map(async (url) => {
        const response = await fetch(`${url.trim()}/ping.txt`).catch(() => null);
        const text = response ? await response.text() : '';
        const isUp = text.trim() === 'pong';
        return { url, isUp };
      }),
    );
    const description = `**Here are the following places available to watch \`${media.title}\`**:\n\n${urlStatuses
      .filter(({ isUp }) => isUp)
      .map(({ url }) => `- [${new URL(url).hostname}](${url.trim()}/media/tmdb-${media.type}-${media.tmdbId})`)
      .join('\n')}`;
    const embeds = [
      {
        title: '🎞️ Watch on movie-web',
        description,
        color: 0xa87fd1,
      },
    ];
    await interaction.editReply({ components: [actionRow] });
    const filter = (i: { customId: string }) => i.customId === 'watch_on_movie_web';
    if (interaction.channel) {
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
      collector.on('collect', async (i) => {
        if (i.customId === 'watch_on_movie_web') {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Instance Info')
              .setEmoji('ℹ️')
              .setStyle(ButtonStyle.Link)
              .setURL('https://movie-web.github.io/docs/instances#community-instances'),
          );

          await i.reply({ embeds, components: [row], ephemeral: true });
        }
      });
      collector.on('end', async () => {
        button.setDisabled(true);
        try {
          await interaction.editReply({ components: [actionRow] });
        } catch (error) {
          if (error instanceof DiscordAPIError && error.code === 10008) {
            return;
          }
          throw error;
        }
      });
    }
  }

  await makeResponseEmbed(cache, interaction, numberOfSuccesses > 0, numberOfSuccesses);
}

function determineSourceType(options: SourcererOptions): SourceType | null {
  let sourceType: SourceType | null = null;

  if (options.flags.includes(flags.CF_BLOCKED)) {
    sourceType = SourceType.CUSTOM_PROXY;
  }

  if (!options.flags.includes(flags.CORS_ALLOWED) || options.flags.includes(flags.IP_LOCKED)) {
    sourceType = SourceType.EXTENSION;
  }

  return sourceType;
}

export function transformSearchResultToScrapeMedia(
  type: 'tv' | 'movie',
  result: TvShowDetails | MovieDetails,
  season?: number,
  episode?: number,
): ScrapeMedia {
  if (type === 'tv') {
    const tvResult = result as TvShowDetails;
    return {
      type: 'show',
      tmdbId: tvResult.id.toString(),
      title: tvResult.name,
      releaseYear: new Date(tvResult.first_air_date).getFullYear(),
      season: {
        number:
          season ??
          tvResult.seasons.find((s) => s.season_number === 1)?.season_number ??
          tvResult.seasons[0].season_number,
        tmdbId: season
          ? tvResult.seasons.find((s) => s.season_number === season)?.id.toString() ?? ''
          : tvResult.seasons[0].id.toString(),
      },
      episode: {
        number: episode ?? 1,
        tmdbId: '',
      },
    };
  }
  if (type === 'movie') {
    const movieResult = result as MovieDetails;
    return {
      type: 'movie',
      tmdbId: movieResult.id.toString(),
      title: movieResult.title,
      releaseYear: new Date(movieResult.release_date).getFullYear(),
    };
  }

  throw new Error('Invalid type parameter');
}

interface Source {
  id: string;
  type: SourceType | null;
  rank: number;
}

function makeSourceString(source: Source, status: Status, client: Client): string {
  return `${getStatusEmote(status, client)} \`${source.id}\`${source.type ? ` ${source.type}` : ''}`;
}

async function makeResponseEmbed(
  cache: CacheCollection,
  interaction: CommandInteraction,
  success?: boolean,
  numberOfSuccesses?: number,
): Promise<void> {
  const sources = cache.getSources();
  const media = cache.getMedia();
  const status = cache.getStatus();

  if (!sources?.length || !media || !status) {
    return void interaction.editReply('An error occurred while collecting providers.');
  }

  let title = `${media.title} (${media.releaseYear})`;
  if (media.type === 'show' && media.season && media.episode) {
    title = `${media.title} S${media.season.number.toString().padStart(2, '0')}E${media.episode.number
      .toString()
      .padStart(2, '0')} (${media.releaseYear})`;
  }

  const description = sources
    .map((source) => {
      const sourceStatus = status.find((s) => s.id === source.id);
      if (!sourceStatus) return undefined;
      return makeSourceString(source, sourceStatus.status, interaction.client);
    })
    .join('\n');

  const embed = {
    title,
    description: `${description}\n\n${SourceType.CUSTOM_PROXY} source requires a [custom proxy](<https://movie-web.github.io/docs/proxy/deploy>) or below\n${SourceType.EXTENSION} source requires the [browser extension](<https://github.com/movie-web/extension/releases/latest>) or below\n${SourceType.NATIVE} source requires the [native app](<https://github.com/movie-web/native-app/releases/latest>)`,
    color: 0xa87fd1,
    thumbnail: {
      url: getMediaPoster(cache.getPosterPath()!),
    },
    author: {
      name: `movie-web`,
      icon_url: interaction.client.user?.displayAvatarURL(),
    },
    timestamp: new Date().toISOString(),
    ...(success !== undefined
      ? {
          footer: {
            text: `${
              success
                ? `✅ found ${numberOfSuccesses} video${numberOfSuccesses === 1 ? '' : 's'}`
                : `❌ found ${numberOfSuccesses} videos`
            }`,
          },
        }
      : {}),
  } satisfies APIEmbed;

  await interaction.editReply({ embeds: [embed] });
}

function getMediaPoster(posterPath: string): string {
  return `https://image.tmdb.org/t/p/w185/${posterPath}`;
}

interface ProviderStatus {
  id: string;
  status: Status;
}

function getStatusEmote(status: Status, client: Client): GuildEmoji {
  return client.emojis.cache.find((emoji) => emoji.id === statusEmojiIds[status].find((id) => emoji.id === id))!;
}

class CacheCollection extends Collection<string, any> {
  public setSources(value: Source[]) {
    this.set('sources', value);
  }

  public getSources(): Source[] | undefined {
    return this.get('sources') as Source[] | undefined;
  }

  public getStatus(): ProviderStatus[] | undefined {
    return this.get('status') as ProviderStatus[] | undefined;
  }

  public setStatus(value: ProviderStatus[]) {
    this.set('status', value);
  }

  public setMedia(value: ScrapeMedia) {
    this.set('media', value);
  }

  public getMedia(): ScrapeMedia | undefined {
    return this.get('media') as ScrapeMedia | undefined;
  }

  public setPosterPath(value: string) {
    this.set('posterPath', value);
  }

  public getPosterPath(): string | undefined {
    return this.get('posterPath') as string | undefined;
  }
}

export const commandRanCounter = new Counter({
  name: 'commands_ran_total',
  help: 'Total number of commands ran',
});

function isChatInputPayload(payload: any): payload is IChatInputCommandPayload {
  return payload && 'interaction' in payload;
}

function isContextMenuPayload(payload: any): payload is IContextMenuCommandPayload {
  return payload && 'interaction' in payload;
}

const ignoredCodes = [RESTJSONErrorCodes.UnknownInteraction, RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged];

export function isRealError(error: Error): boolean {
  if (error instanceof DiscordAPIError || error instanceof HTTPError) {
    if (ignoredCodes.includes(error.status)) {
      return false;
    }
  }
  return true;
}

export function handleError(
  error: Error,
  payload:
    | IChatInputCommandPayload
    | IContextMenuCommandPayload
    | ListenerErrorPayload
    | InteractionHandlerError
    | InteractionHandlerParseError,
) {
  if (!isRealError(error)) return;
  if (!isChatInputPayload(payload) && !isContextMenuPayload(payload)) return;

  if (payload.interaction.deferred || payload.interaction.replied) {
    return payload.interaction.editReply({ content: error.message });
  }
  return payload.interaction.reply({ content: error.message });
}

export function constructTagButtons(
  data: TagUrlButtonData[] | undefined,
): ActionRowBuilder<ButtonBuilder>[] | undefined {
  if (!data) return undefined;
  const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];
  let actionRow = new ActionRowBuilder<ButtonBuilder>();

  for (const [index, item] of data.entries()) {
    if (index % 5 === 0 && index !== 0) {
      actionRows.push(actionRow);
      actionRow = new ActionRowBuilder<ButtonBuilder>();
    }

    actionRow.addComponents(new ButtonBuilder().setLabel(item.label).setStyle(ButtonStyle.Link).setURL(item.url));
  }

  actionRows.push(actionRow);
  return actionRows;
}

function timeout(ms: number) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), ms);
  });
}
