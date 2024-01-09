import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as url from 'url';

import TOML from '@ltd/j-toml';
import { Collection } from 'discord.js';
import { createConfigLoader } from 'neat-config';
import { z } from 'zod';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const schema = z.object({
  discordToken: z.string().min(1),
  guildId: z.string().min(17),
  tmdbApiKey: z.string().min(1),
  tagRefreshUrl: z
    .string()
    .min(1)
    .default('https://raw.githubusercontent.com/movie-web/discord-bot/master/src/tags.toml'),
  mwIconUrl: z.string().min(1).default('https://movie-web.app/android-chrome-512x512.png'),
});

const prefix = 'CONF_';

export enum Status {
  WAITING,
  LOADING,
  SUCCESS,
  FAILURE,
}

export const statusEmojiIds = {
  [Status.WAITING]: ['1149017166478327900', '1149114608309784739'],
  [Status.LOADING]: ['1149016985699627018', '1149114549748899860'],
  [Status.SUCCESS]: ['1149017114515083386', '1149114472158474290'],
  [Status.FAILURE]: ['1149017090670465054', '1149114672042213406'],
};

export const config = createConfigLoader()
  .addFromFile('.env', { prefix })
  .addFromEnvironment(prefix)
  .addZodSchema(schema)
  .load();

export interface TagUrlButtonData {
  label: string;
  url: string;
}

const embedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.string().url().max(2000).optional(),
  timestamp: z.string().datetime().optional(),
  color: z.number().int().optional(),
  footer: z
    .object({
      text: z.string().max(2048),
      icon_url: z.string().url().max(2000).optional(),
    })
    .optional(),
  image: z
    .object({
      url: z.string().url().max(2000),
    })
    .optional(),
  thumbnail: z
    .object({
      url: z.string().url().max(2000),
    })
    .optional(),
  author: z
    .object({
      name: z.string().max(256),
      url: z.string().url().max(2000).optional(),
      icon_url: z.string().url().max(2000).optional(),
    })
    .optional(),
  fields: z
    .array(
      z.object({
        name: z.string().max(256),
        value: z.string().max(1024),
        inline: z.boolean().optional(),
      }),
    )
    .max(25)
    .optional(),
});

const tagSchema = z
  .object({
    isContextEnabled: z.boolean(),
    content: z.string().min(1).max(2000),
    embeds: z.array(embedSchema).nonempty().max(10).optional(),
    urls: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          url: z.string().url().min(1).max(2000),
        }),
      )
      .nonempty()
      .max(25)
      .optional(),
  })
  .refine((tag) => {
    const contextEnabledTags = tag.isContextEnabled ? 1 : 0;
    return contextEnabledTags >= 1 && contextEnabledTags <= 25;
  }, 'The number of context-enabled tags must be between 1 and 25.');

type Tag = z.infer<typeof tagSchema>;
export type TagStore = Record<string, Tag>;

export function validateTags(tagStore: TagStore) {
  for (const [key, tag] of Object.entries(tagStore)) {
    try {
      tagSchema.parse(tag);
    } catch (e: any) {
      throw new z.ZodError([{ message: `Failed to parse tag '${key}'`, ...e }]);
    }
  }
}

const tagStore = TOML.parse(readFileSync(path.join(__dirname, 'tags.toml'), 'utf8'), '\n') as TagStore;
validateTags(tagStore);

export const tagCache = new Collection<string, Tag>();

for (const [key, tag] of Object.entries(tagStore)) {
  tagCache.set(key, tag);
}

export const mwUrls = readFileSync(path.join(__dirname, 'mw-urls.txt'), 'utf8').split('\n');

const mwUrlsSchema = z.array(z.string().url().min(1).max(100)).max(20);
mwUrlsSchema.parse(mwUrls);
