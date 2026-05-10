import cloneDeep from "lodash-es/cloneDeep";
import { getPlatformURL } from "src/core/createClient";
import { queryFindScenesForSelect } from "src/core/StashService";
import { objectTitle } from "src/core/files";
import type { ListFilterModel } from "src/models/list-filter/filter";
import type { QueuedScene } from "src/models/sceneQueue";

/** 与后端 `ScenePlaylistM3U` 的 ids 上限一致。 */
export const MAX_HOSTED_PLAYLIST_SCENES = 500;

/** 将 Stash 返回的 stream 路径解析为可在 IINA/VLC 等外部播放器中请求的绝对 URL。 */
export function absoluteStreamUrl(stream: string): string {
  try {
    return new URL(stream).href;
  } catch {
    return new URL(stream, window.location.origin).href;
  }
}

/**
 * 根据当前队列生成 M3U（顺序与 `queueScenes` 一致）。
 * Stash 的 `paths.stream` 已包含 `apikey`（若服务端配置了 API Key）。
 */
export function buildSceneQueueM3u(scenes: QueuedScene[]): string {
  const lines: string[] = ["#EXTM3U"];
  for (const scene of scenes) {
    const stream = scene.paths?.stream;
    if (!stream) continue;
    const label =
      objectTitle(scene).replace(/,/g, " ").replace(/\r?\n/g, " ").trim() ||
      `Scene ${scene.id}`;
    lines.push(`#EXTINF:-1,${label}`);
    lines.push(absoluteStreamUrl(stream));
  }
  return `${lines.join("\n")}\n`;
}

export function downloadTextAsFile(
  content: string,
  filename: string,
  mime: string
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** IINA macOS URL Scheme：`url` 必须为整段编码后的目标流地址。 */
export function buildIinaWeblink(streamUrl: string): string {
  return `iina://weblink?url=${encodeURIComponent(
    absoluteStreamUrl(streamUrl)
  )}`;
}

/** 服务端托管的扩展 M3U（`/scene/playlist.m3u`），供 IINA 等通过网络拉取整份队列。 */
export function buildHostedPlaylistM3uUrl(sceneIds: string[]): string {
  if (sceneIds.length === 0) return "";
  const u = getPlatformURL();
  const basePath = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  u.pathname = `${basePath}scene/playlist.m3u`;
  u.search = "";
  u.searchParams.set("ids", sceneIds.join(","));
  return u.href;
}

/**
 * 将某条 `paths.stream` 上的 `apikey` 复制到播放列表 URL（外部播放器通常不带浏览器 Cookie）。
 */
export function copyApiKeyFromSampleStream(
  targetUrl: string,
  sampleStreamUrl: string | undefined
): string {
  if (!sampleStreamUrl) return targetUrl;
  try {
    const from = new URL(absoluteStreamUrl(sampleStreamUrl));
    const key = from.searchParams.get("apikey");
    if (!key) return targetUrl;
    const u = new URL(targetUrl);
    u.searchParams.set("apikey", key);
    return u.href;
  } catch {
    return targetUrl;
  }
}

/** 从多条场景记录中取第一条可用的 `paths.stream`，用于抽取 `apikey`。 */
export function pickSampleStreamUrlFromScenes(
  scenes: { paths?: { stream?: string | null } | null }[]
): string | undefined {
  for (const s of scenes) {
    const stream = s.paths?.stream;
    if (stream) return stream;
  }
  return undefined;
}

/**
 * 按当前列表筛选条件分页拉取场景 id，最多 `maxIds` 条（顺序与列表排序一致）。
 */
export async function fetchSceneIdsForPlaylist(
  filter: ListFilterModel,
  maxIds: number
): Promise<string[]> {
  const ids: string[] = [];
  const perPage = Math.min(250, maxIds);
  let page = 1;
  while (ids.length < maxIds) {
    const f = cloneDeep(filter);
    f.currentPage = page;
    f.itemsPerPage = perPage;
    const res = await queryFindScenesForSelect(f);
    const scenes = res.data?.findScenes?.scenes ?? [];
    if (scenes.length === 0) break;
    for (const s of scenes) {
      ids.push(s.id);
      if (ids.length >= maxIds) break;
    }
    if (scenes.length < perPage) break;
    page++;
  }
  return ids;
}
