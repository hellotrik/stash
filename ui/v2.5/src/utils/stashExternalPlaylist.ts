import { getPlatformURL } from "src/core/createClient";
import { objectTitle } from "src/core/files";
import type { QueuedScene } from "src/models/sceneQueue";

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
