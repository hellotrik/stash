import React, { useMemo } from "react";
import { Button } from "react-bootstrap";
import { useIntl } from "react-intl";
import { Icon } from "src/components/Shared/Icon";
import { faListUl, faPlayCircle } from "@fortawesome/free-solid-svg-icons";
import type * as GQL from "src/core/generated-graphql";
import type { QueuedScene } from "src/models/sceneQueue";
import {
  buildHostedPlaylistM3uUrl,
  buildIinaWeblink,
  buildSceneQueueM3u,
  copyApiKeyFromSampleStream,
  downloadTextAsFile,
} from "src/utils/stashExternalPlaylist";

export interface IDesktopExternalPlaylistButtonProps {
  queueScenes: QueuedScene[];
  scene: GQL.SceneDataFragment;
}

/** 桌面端：导出与侧边队列一致的 M3U；在 macOS 上可通过托管播放列表 URL 让 IINA 打开整队。 */
export const DesktopExternalPlaylistButton: React.FC<
  IDesktopExternalPlaylistButtonProps
> = ({ queueScenes, scene }) => {
  const intl = useIntl();

  const isHandheld = useMemo(
    () => /(android|iphone|ipad|ipod)/i.test(navigator.userAgent),
    []
  );

  const isMacDesktop = useMemo(
    () => !isHandheld && /Mac/i.test(navigator.userAgent),
    [isHandheld]
  );

  const scenesWithStream = useMemo(() => {
    const listed = queueScenes.filter((s) => s.paths?.stream);
    if (listed.length > 0) {
      return listed;
    }
    if (scene.paths?.stream) {
      const one: QueuedScene = {
        id: scene.id,
        title: scene.title,
        date: scene.date,
        paths: scene.paths,
        performers: scene.performers,
        studio: scene.studio,
      };
      return [one];
    }
    return [];
  }, [queueScenes, scene]);

  const firstStream = scenesWithStream[0]?.paths?.stream;

  const iinaHref = useMemo(() => {
    if (!isMacDesktop || scenesWithStream.length === 0) return undefined;
    const ids = scenesWithStream.map((s) => String(s.id));
    const hosted = buildHostedPlaylistM3uUrl(ids);
    if (!hosted) return undefined;
    const withKey = copyApiKeyFromSampleStream(
      hosted,
      firstStream ?? undefined
    );
    return buildIinaWeblink(withKey);
  }, [firstStream, isMacDesktop, scenesWithStream]);

  if (isHandheld || scenesWithStream.length === 0) {
    return null;
  }

  const onDownloadM3u = () => {
    const body = buildSceneQueueM3u(scenesWithStream);
    downloadTextAsFile(
      body,
      `stash-playlist-${scenesWithStream.length}-scenes.m3u`,
      "application/vnd.apple.mpegurl;charset=utf-8"
    );
  };

  return (
    <span className="d-inline-flex align-items-center gap-1">
      <Button
        className="minimal px-0 px-sm-2 pt-2"
        variant="secondary"
        title={intl.formatMessage({ id: "actions.download_playlist_m3u" })}
        onClick={onDownloadM3u}
      >
        <Icon icon={faListUl} color="white" />
      </Button>
      {iinaHref ? (
        <Button
          as="a"
          className="minimal px-0 px-sm-2 pt-2"
          variant="secondary"
          href={iinaHref}
          rel="noopener noreferrer"
          title={intl.formatMessage({ id: "actions.open_playlist_in_iina" })}
        >
          <Icon icon={faPlayCircle} color="white" />
        </Button>
      ) : null}
    </span>
  );
};

export default DesktopExternalPlaylistButton;
