import {inject, Injectable} from "@angular/core";
import {EditorState, ResultOptions} from "../common/EditorState";

import * as localForage from "localforage";
import {EventBus, HISTORY_ITEM_SAVED} from "./EventBus";

function entryMatches(a: EditorState, b: EditorState): boolean {
    return a.content === b.content && a.queryType === b.queryType && a.application === b.application;
}

const HISTORY_KEY = 'history';

const LAST_STATE_KEY = 'lastState';

export interface HistoryEntry extends EditorState {
    timestamp: number;
}

/**
 * A service providing access to the query history and last editor state, both of which
 * are contained in local browser storage using the LocalForage library.
 */
@Injectable({ providedIn: "root" })
export class HistoryService {
  private eventBus: EventBus = inject(EventBus);

  /**
   * The LocalForage instance used to store the query history and last editor state.
   * @private
   */
  private readonly historyStore: LocalForage = localForage.createInstance({
    name: "query-plugin-history",
    storeName: "history",
    driver: [localForage.INDEXEDDB, localForage.LOCALSTORAGE],
  });

  /**
   * Load the last editor state from local storage.
   */
  async loadLastEditorState(): Promise<EditorState | null> {
    let lastState =
      await this.historyStore.getItem<EditorState>(LAST_STATE_KEY);
    if (lastState) {
      return {
        content: lastState.content || "",
        queryType: lastState.queryType || "SQL",
        application: lastState.application,
        rowLimit: lastState.rowLimit || 100,
        startAt: lastState.startAt || 0,
        queryClass: lastState.queryClass || "",
      };
    }
    return null;
  }

  /**
   * Load the history from local storage, sorted descending by timestamp.
   */
  async loadHistory(): Promise<HistoryEntry[]> {
    let history =
      (await this.historyStore.getItem<HistoryEntry[]>(HISTORY_KEY)) || [];
    return history.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Stores any non-default result display options in local storage so that they can
   * be persisted across sessions and reapplied when the user returns.
   * 
   * @param resultOptions The result display options to store. Only options that differ from the default will be stored.
   */
  async storeResultOptions(resultOptions: ResultOptions) {
    const options: Partial<ResultOptions> = {}
    
    if (resultOptions.pageSize !== 25) {
        options.pageSize = resultOptions.pageSize;
    }

    if (resultOptions.hideEmptyColumns) {
        options.hideEmptyColumns = resultOptions.hideEmptyColumns;
    }

    if (resultOptions.hiddenColumns && resultOptions.hiddenColumns.length > 0) {
        options.hiddenColumns = resultOptions.hiddenColumns;
    }

    await this.historyStore.setItem("resultOptions", options);
  }

  /**
   * Stores the most recent editor state in local storage.
   * @param editorState The editor state to store.
   */
  async storeEditorState(editorState: EditorState) {
    const lastState: EditorState = {
      content: editorState.content,
      queryType: editorState.queryType,
      application: editorState.application,
      rowLimit: editorState.rowLimit,
      startAt: editorState.startAt,
      queryClass: editorState.queryClass || "",
    };

    await this.historyStore.setItem(LAST_STATE_KEY, lastState);
  }

  /**
   * Stores a new history entry in local storage. If there is a matching entry
   * already in storage, it is updated with the new timestamp.
   *
   * @param editorState The editor state to store in history.
   */
  async storeHistory(editorState: EditorState) {
    const existingHistory =
      (await this.historyStore.getItem<HistoryEntry[]>(HISTORY_KEY)) || [];

    const exists: boolean = existingHistory.some((item) =>
      entryMatches(item, editorState),
    );

    if (exists) {
      // remove the existing entry and update it with the new timestamp
      let updatedHistory = existingHistory.filter(
        (item) => !entryMatches(item, editorState),
      );
      let newEntry: HistoryEntry = {
        ...editorState,
        timestamp: Date.now(),
      };

      await this.historyStore.setItem("history", [...updatedHistory, newEntry]);

      this.eventBus.emit(HISTORY_ITEM_SAVED, { item: newEntry });
    } else {
      const newEntry: HistoryEntry = {
        ...editorState,
        timestamp: Date.now(),
      };
      await this.historyStore.setItem("history", [
        ...existingHistory,
        newEntry,
      ]);
      this.eventBus.emit(HISTORY_ITEM_SAVED, { item: newEntry });
    }

    return await this.loadHistory();
  }
}