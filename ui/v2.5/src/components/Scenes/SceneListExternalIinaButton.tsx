/**
 * 古月方源·大爱仙尊｜卷土重来（摘录）—— 今日暂且展翼去，明朝登仙笞凤凰。
 * 溯源：蛊真人 · 《蛊真人》全诗词整理（完整版）
 *
 * 短片列表工具栏：将当前筛选结果或所选条目交给 IINA（托管 M3U）。
 */
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { useIntl } from "react-intl";
import { Icon } from "src/components/Shared/Icon";
import { faPlayCircle } from "@fortawesome/free-solid-svg-icons";
import type * as GQL from "src/core/generated-graphql";
import { useToast } from "src/hooks/Toast";
import type { ListFilterModel } from "src/models/list-filter/filter";
import {
  MAX_HOSTED_PLAYLIST_SCENES,
  buildHostedPlaylistM3uUrl,
  buildIinaWeblink,
  copyApiKeyFromSampleStream,
  fetchSceneIdsForPlaylist,
  pickSampleStreamUrlFromScenes,
} from "src/utils/stashExternalPlaylist";

export interface ISceneListExternalIinaButtonProps {
  effectiveFilter: ListFilterModel;
  items: GQL.SlimSceneDataFragment[];
  selectedIds: Set<string>;
  selectedItems: GQL.SlimSceneDataFragment[];
  hasSelection: boolean;
  totalCount: number;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 交给系统处理 `iina://` 后关闭脚本打开的占位标签，避免长期残留空白页。 */
const PLACEHOLDER_CLOSE_AFTER_IINA_MS = 800;

function buildIinaUrlForSceneIds(
  ids: string[],
  sampleScenes: GQL.SlimSceneDataFragment[]
): string | undefined {
  if (ids.length === 0) return undefined;
  const capped =
    ids.length > MAX_HOSTED_PLAYLIST_SCENES
      ? ids.slice(0, MAX_HOSTED_PLAYLIST_SCENES)
      : ids;
  const hosted = buildHostedPlaylistM3uUrl(capped);
  if (!hosted) return undefined;
  const sampleStream = pickSampleStreamUrlFromScenes(sampleScenes);
  const withKey = copyApiKeyFromSampleStream(hosted, sampleStream);
  return buildIinaWeblink(withKey);
}

export const SceneListExternalIinaButton: React.FC<
  ISceneListExternalIinaButtonProps
> = ({
  effectiveFilter,
  items,
  selectedIds,
  selectedItems,
  hasSelection,
  totalCount,
}) => {
  const intl = useIntl();
  const Toast = useToast();
  const [busy, setBusy] = useState(false);

  const isHandheld = useMemo(
    () => /(android|iphone|ipad|ipod)/i.test(navigator.userAgent),
    []
  );

  const isMacDesktop = useMemo(
    () => !isHandheld && /Mac/i.test(navigator.userAgent),
    [isHandheld]
  );

  /** 当前页已包含全部筛选结果时，可不经过 await，直接用真实 `<a href="iina://…">`。 */
  const singlePageAllResults = totalCount <= items.length;

  const syncIinaHref = useMemo(() => {
    if (!isMacDesktop || items.length === 0) return undefined;

    if (hasSelection) {
      const ids = Array.from(selectedIds.values());
      return buildIinaUrlForSceneIds(ids, [...selectedItems, ...items]);
    }

    if (singlePageAllResults) {
      const ids = items.map((s) => s.id);
      return buildIinaUrlForSceneIds(ids, items);
    }

    return undefined;
  }, [
    hasSelection,
    isMacDesktop,
    items,
    selectedIds,
    selectedItems,
    singlePageAllResults,
  ]);

  const navigateOrClosePlaceholder = useCallback(
    (placeholder: Window | null, iinaUrl: string) => {
      if (placeholder && !placeholder.closed) {
        placeholder.location.href = iinaUrl;
        window.setTimeout(() => {
          try {
            if (!placeholder.closed) {
              placeholder.close();
            }
          } catch {
            /* 部分浏览器在自定义协议跳转后仍允许关闭由脚本打开的窗口 */
          }
        }, PLACEHOLDER_CLOSE_AFTER_IINA_MS);
        return;
      }
      const a = document.createElement("a");
      a.href = iinaUrl;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    []
  );

  const openMultiPagePlaylist = useCallback(() => {
    if (!isMacDesktop || items.length === 0 || busy) return;

    const placeholder = window.open("", "_blank");
    if (placeholder && !placeholder.closed) {
      try {
        const line = escapeHtmlText(
          intl.formatMessage({ id: "toast.iina_placeholder_window_message" })
        );
        placeholder.document.open();
        placeholder.document.write(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>IINA</title></head><body style="margin:0;font:15px system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#111;color:#ddd">${line}</body></html>`
        );
        placeholder.document.close();
      } catch {
        /* 极少数环境下无法写入占位文档，仍尝试后续跳转 */
      }
    }

    void (async () => {
      setBusy(true);
      try {
        const ids = await fetchSceneIdsForPlaylist(
          effectiveFilter,
          MAX_HOSTED_PLAYLIST_SCENES
        );

        if (totalCount > MAX_HOSTED_PLAYLIST_SCENES) {
          Toast.success(
            intl.formatMessage(
              { id: "toast.iina_playlist_truncated" },
              { max: MAX_HOSTED_PLAYLIST_SCENES }
            )
          );
        }

        if (ids.length === 0) {
          placeholder?.close();
          Toast.error(
            intl.formatMessage({ id: "toast.iina_no_playable_scenes" })
          );
          return;
        }

        const iinaUrl = buildIinaUrlForSceneIds(ids, items);
        if (!iinaUrl) {
          placeholder?.close();
          return;
        }

        navigateOrClosePlaceholder(placeholder, iinaUrl);

        if (!placeholder) {
          Toast.success(
            intl.formatMessage({ id: "toast.iina_popup_fallback_hint" })
          );
        }
      } catch (e) {
        placeholder?.close();
        Toast.error(e);
      } finally {
        setBusy(false);
      }
    })();
  }, [
    Toast,
    busy,
    effectiveFilter,
    intl,
    isMacDesktop,
    items,
    navigateOrClosePlaceholder,
    totalCount,
  ]);

  if (!isMacDesktop || items.length === 0) {
    return null;
  }

  const title = intl.formatMessage({ id: "actions.open_scene_list_in_iina" });

  if (syncIinaHref) {
    return (
      <Button
        as="a"
        className="scene-list-iina-button"
        variant="secondary"
        href={syncIinaHref}
        rel="noopener noreferrer"
        title={title}
        onClick={() => {
          if (hasSelection && selectedIds.size > MAX_HOSTED_PLAYLIST_SCENES) {
            Toast.success(
              intl.formatMessage(
                { id: "toast.iina_playlist_truncated" },
                { max: MAX_HOSTED_PLAYLIST_SCENES }
              )
            );
          }
        }}
      >
        <Icon icon={faPlayCircle} />
      </Button>
    );
  }

  return (
    <Button
      className="scene-list-iina-button"
      variant="secondary"
      disabled={busy}
      title={title}
      onClick={openMultiPagePlaylist}
    >
      <Icon icon={faPlayCircle} />
    </Button>
  );
};
