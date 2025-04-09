// mockEPG.ts

export interface EPGRoot {
  [date: string]: {
    channels: Channel[]
  }
}

export interface Channel {
  channelId: number
  items: Program[]
}

export interface Program {
  channelId: number
  id: number
  start: number
  end: number
  title: string
  genre?: string
}

export interface ChannelsBriefRoot {
  array: ChannelBrief[]
  map: { [channelId: number]: number }
}

export interface ChannelBrief {
  channelId: number
  type: string
  defaultChannelPosition: number
  logoUrl: string
  name: string
}

function generateMockEPG(channelCount = 3): {
  epg: EPGRoot
  epgMap: { [date: string]: { [channelId: number]: number } }
  channelsBrief: ChannelsBriefRoot
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dateKey = '2025-04-09';

  const epg: EPGRoot = {
    [dateKey]: {
      channels: [],
    },
  };

  const epgMap: { [date: string]: { [channelId: number]: number } } = {
    [dateKey]: {},
  };

  const channelsBrief: ChannelsBriefRoot = {
    array: [],
    map: {},
  };

  for (let i = 0; i < channelCount; i++) {
    const channelId = i + 1;

    const brief: ChannelBrief = {
      channelId,
      type: 'iptv',
      defaultChannelPosition: channelId,
      logoUrl: 'https://via.placeholder.com/100',
      name: `Kanál ${channelId}`,
    };

    channelsBrief.array.push(brief);
    channelsBrief.map[channelId] = i;
    epgMap[dateKey][channelId] = i;

    const items: Program[] = [];
    let current = new Date(now);
    let progIndex = 1;

    while (current.getDate() === now.getDate()) {
      const duration = Math.floor(Math.random() * (120 - 10 + 1)) + 10;
      const end = new Date(current.getTime() + duration * 60 * 1000);
      if (end.getDate() !== now.getDate()) { break; }

      items.push({
        channelId,
        id: channelId * 100 + progIndex,
        start: current.getTime(),
        end: end.getTime(),
        title: `Program ${progIndex}`,
        genre: ['movie', 'news', 'sports'][Math.floor(Math.random() * 3)],
      });

      current = end;
      progIndex++;
    }

    epg[dateKey].channels.push({ channelId, items });
  }

  return { epg, epgMap, channelsBrief };
}

// === EXPORTY ===
export const { epg, epgMap, channelsBrief } = generateMockEPG(100);
