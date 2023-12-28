import { ApplyOptions } from '@sapphire/decorators';
import { Listener, type ListenerOptions } from '@sapphire/framework';
import { ActivityType } from 'discord.js';
import axios from 'axios';

@ApplyOptions<ListenerOptions>({ once: true })
export class ReadyListener extends Listener {
  public async run() {
    await this.container.client.application?.fetch();

    // function to fetch repository data
    const fetchRepoData = async () => {
      try {
        const response = await axios.get('https://api.github.com/repos/movie-web/movie-web');
        const data = response.data;
        return {
          stars: data.stargazers_count,
          forks: data.forks_count,
          // add more data as needed
        };
      } catch (error) {
        console.error('Error fetching repository data:', error);
        return null;
      }
    };

    // function to update activity
    const updateActivity = async () => {
      const repoData = await fetchRepoData();
      if (repoData) {
        const activities = [
          { type: ActivityType.Watching, name: `Stars: ${repoData.stars}` },
          { type: ActivityType.Playing, name: `Forks: ${repoData.forks}` },
          // add more shit 
        ];

        const activity = activities[Math.floor(Math.random() * activities.length)];
        this.container.client.user?.setActivity(activity);
      } else {
        // activity if fetching fails
        this.container.client.user?.setActivity({ type: ActivityType.Watching, name: 'movie-web.app' });
      }
    };

    // activity every 30 seconds
    setInterval(updateActivity, 30e3);

    this.container.logger.info('Ready!');
  }
}
