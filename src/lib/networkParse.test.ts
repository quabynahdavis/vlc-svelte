import { describe, expect, test } from 'bun:test';
import {
  parseClockDuration,
  parseFeed,
  parseIcecastDirectory,
  parseJamendoTracks,
  parseShoutcastDirectory,
} from './networkParse';

describe('podcast feeds', () => {
  test('reads an RSS enclosure, duration and image only when present', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <title>Signal</title>
        <item>
          <title>Pilot</title>
          <itunes:duration>1:02:03</itunes:duration>
          <itunes:image href="https://cdn.example/pilot.jpg"/>
          <enclosure url="https://cdn.example/pilot.mp3" type="audio/mpeg"/>
        </item>
        <item>
          <title>Live</title>
          <enclosure url="https://cdn.example/live.mp3" type="audio/mpeg"/>
        </item>
      </channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed?.title).toBe('Signal');
    expect(feed?.episodes).toHaveLength(2);
    expect(feed?.episodes[0]?.durationSeconds).toBe(3723);
    expect(feed?.episodes[0]?.thumbnailUrl).toBe('https://cdn.example/pilot.jpg');
    expect(feed?.episodes[1]?.durationSeconds).toBeUndefined();
    expect(feed?.episodes[1]?.thumbnailUrl).toBeUndefined();
  });

  test('reads an Atom enclosure', () => {
    const xml = `<?xml version="1.0"?>
      <feed><title>Atom Show</title>
        <entry>
          <title>One</title>
          <link rel="enclosure" type="audio/mpeg" href="https://cdn.example/one.mp3"/>
        </entry>
      </feed>`;
    const feed = parseFeed(xml);
    expect(feed?.episodes[0]?.url).toBe('https://cdn.example/one.mp3');
    expect(feed?.episodes[0]?.durationSeconds).toBeUndefined();
  });

  test('rejects a page that is not a feed', () => {
    expect(parseFeed('<html><title>Nope</title></html>')).toBeNull();
  });
});

describe('directories', () => {
  test('lists Icecast stations that published a listen url', () => {
    const xml = `<directory>
      <entry><server_name>Harbor</server_name><listen_url>http://radio.example/stream</listen_url></entry>
      <entry><listen_url></listen_url><server_name>Missing</server_name></entry>
    </directory>`;
    const parsed = parseIcecastDirectory(xml);
    expect(parsed.stations).toEqual([{ name: 'Harbor', url: 'http://radio.example/stream' }]);
  });

  test('keeps an empty Icecast directory empty', () => {
    expect(parseIcecastDirectory('<directory></directory>').stations).toEqual([]);
  });

  test('Jamendo tracks use only fields the payload includes', () => {
    const body = JSON.stringify({
      headers: { status: 'success' },
      results: [
        { id: 7, name: 'North', audio: 'https://mp3.jamendo.com/north', duration: 180, image: 'https://img.jamendo.com/n.jpg' },
        { id: 8, name: 'Untitled stream', audio: 'https://mp3.jamendo.com/live' },
      ],
    });
    const parsed = parseJamendoTracks(body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tracks[0]?.durationSeconds).toBe(180);
    expect(parsed.tracks[0]?.thumbnailUrl).toBe('https://img.jamendo.com/n.jpg');
    expect(parsed.tracks[1]?.durationSeconds).toBeUndefined();
    expect(parsed.tracks[1]?.thumbnailUrl).toBeUndefined();
  });

  test('Jamendo errors do not invent tracks', () => {
    const parsed = parseJamendoTracks(JSON.stringify({ headers: { status: 'failed', error_message: 'Invalid client id' }, results: [] }));
    expect(parsed.ok).toBe(false);
  });

  test('a retired Shoutcast response is unavailable', () => {
    expect(parseShoutcastDirectory('404 page not found').available).toBe(false);
    expect(parseShoutcastDirectory('<html><title>Gone</title></html>').stations).toEqual([]);
  });

  test('a real Shoutcast station record is listed', () => {
    const parsed = parseShoutcastDirectory('<stationlist><station name="Harbor" id="42" br="128"/></stationlist>');
    expect(parsed.available).toBe(true);
    expect(parsed.stations[0]?.name).toBe('Harbor');
    expect(parsed.stations[0]?.url).toContain('id=42');
  });
});

describe('clock durations', () => {
  test('ignores blanks and zeroes', () => {
    expect(parseClockDuration('')).toBeUndefined();
    expect(parseClockDuration('0:00')).toBeUndefined();
    expect(parseClockDuration('90')).toBe(90);
  });
});
