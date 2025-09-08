import {
  Component, computed, effect,
  ElementRef, inject, input, model,
  output,
  resource, Signal, signal,
  viewChild, WritableSignal
} from '@angular/core';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers, ViewUpdate
} from "@codemirror/view";
import {debounce} from "../../../common/QueryPluginUtils";
import {
  Compartment,
  EditorState as CMEditorState,
  Extension
} from "@codemirror/state";
import {minimalSetup} from "codemirror";
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting
} from "@codemirror/language";
import {autocompletion, closeBrackets} from "@codemirror/autocomplete";
import {vscodeLight} from "@uiw/codemirror-theme-vscode";
import {highlightSelectionMatches} from "@codemirror/search";
import {defaultKeymap} from "@codemirror/commands";
import {API, DatabaseInfo, QueryType, TableInfo} from "../../../services/API";
import {
  MSSQL,
  MySQL,
  sql,
  SQLConfig,
  SQLDialect,
  StandardSQL
} from "@codemirror/lang-sql";
import {xml} from "@codemirror/lang-xml";
import {EditorState} from "../../../common/EditorState";
import {ApplicationState} from "../../../services/ApplicationState";

interface SchemaMap {
  [table: string]: string[];
}

@Component({
  selector: 'app-codemirror-editor',
  imports: [],
  templateUrl: './codemirror-editor.html',
  styleUrl: './codemirror-editor.scss',
  standalone: true
})
export class CodemirrorEditor {

  api: API = inject(API)

  application = input<string>()

  /**
   * Reference to the editor's DOM element.
   */
  protected editor = viewChild<ElementRef<HTMLDivElement>>('idwQueryPluginEditorSlot')

  codeUpdated = output<string>()

  /**
   * Information about the connected database, including schema and catalog.
   */
  protected readonly databaseInfo: WritableSignal<DatabaseInfo | undefined> = signal<DatabaseInfo | undefined>(undefined);

  languageCompartment = new Compartment()

  lastEditorState = input<EditorState | null>()

  queryType = input.required<QueryType>()

  /**
   * The default schema or catalog name for the current database.
   */
  protected schema: Signal<string> = computed(() => {
    const dbInfo = this.databaseInfo();
    if (dbInfo) {
      return dbInfo.schema || dbInfo.catalog || '';
    }
    return '';
  });

  state: ApplicationState = inject(ApplicationState)

  /**
   * Resource for the CodeMirror editor view instance.
   */
  private readonly editorView = resource({
    params: () => ({editor: this.editor(), nativeElement: this.editor()?.nativeElement, editorState: this.lastEditorState()}),
    loader: ({params}) => this.initializeView(params),
  })

  constructor() {
    effect(() => {
      let queryType = this.queryType();
        let view = this.editorView.value()
        this.replaceSchema(queryType, view);
    });
  }


  /**
   * Initializes the CodeMirror editor view with the given parameters.
   * @param params Parameters including the native DOM element to attach the editor to.
   * @returns A promise that resolves to the initialized EditorView instance.
   * @private
   */
  private async initializeView(params: any): Promise<EditorView | null> {
    const nativeElement = params.nativeElement as HTMLDivElement
    const lastState: EditorState | undefined = params.editorState as EditorState | undefined

    if (lastState === undefined) {
      console.debug("Waiting for last editor state to be provided...");
      return null;
    }

    const code = lastState?.content ?? '';

    let compartmentExtension = this.languageCompartment.of([])

    const debouncedUpdate = debounce(1000, (c: string) => {
      this.updateContent(c);
    })

    const extensions: Extension = [
      minimalSetup,
      highlightActiveLine(),
      bracketMatching(),
      closeBrackets(),
      vscodeLight,
      lineNumbers(),
      syntaxHighlighting(defaultHighlightStyle),
      highlightSelectionMatches({minSelectionLength: 4}),
      keymap.of(defaultKeymap),
      autocompletion({
        activateOnTyping: false
      }),
      compartmentExtension,
      EditorView.updateListener.of((v: ViewUpdate) => {
        if (v.docChanged) {
          const content = v.state.doc.toString();
          debouncedUpdate(content);
        }
      })
    ];

    const view = new EditorView({
      state: CMEditorState.create({
        doc: code,
        extensions: extensions,
      }),
      parent: nativeElement,
    });

    if (code) {
      this.updateContent(code);
    }

    setTimeout(async () => {
      await this.replaceSchema(this.queryType(), view);
    }, 0)

    return view;
  }

  /**
   * Calculates the database schema and updates the SQL configuration accordingly.
   * @param sqlConfig The SQL configuration object to update with schema information.
   * @returns A promise that resolves to the fetched DatabaseInfo, or null if fetching failed.
   * @private
   */
  private async calculateSchema(sqlConfig: SQLConfig) {
    try {
      let databaseInfo: DatabaseInfo = await this.api.enumerateDatabase({
        type: this.queryType(),
        application: this.application()
      })

      console.info("Fetched database info:", databaseInfo);

      if (databaseInfo?.databaseProductName) {
        const name = databaseInfo.databaseProductName.toLowerCase();
        if (name.includes("mysql")) {
          sqlConfig.dialect = MySQL;
        } else if (name.includes("microsoft")) {
          sqlConfig.dialect = MSSQL;
        } else if (name.includes("oracle")) {
          // Oracle is not supported by the SQL plugin, so we use StandardSQL
          let keywordList = databaseInfo.extraKeywords.join( ' ')
          sqlConfig.dialect = SQLDialect.define({
            builtin: StandardSQL.spec.builtin + " SYSDATE SYSTIMESTAMP",
            keywords: StandardSQL.spec.keywords + " " + keywordList,
            operatorChars: StandardSQL.spec.operatorChars,
            doubleQuotedStrings: false,
            types: StandardSQL.spec.types + " VARCHAR2"
          });
        } else {
          sqlConfig.dialect = StandardSQL;
        }
      }

      let tableInfo: TableInfo[] = await this.api.enumerateTables(
          {
            type: this.queryType(),
            application: this.application()
          }
      );

      console.info("Fetched table info:", tableInfo);

      let schemaMap: SchemaMap = {};
      sqlConfig.defaultSchema = databaseInfo?.schema || databaseInfo?.catalog;

      if (sqlConfig.defaultSchema) {
        for (let table of tableInfo) {
          if (table.schema && table.schema === sqlConfig.defaultSchema) {
            schemaMap[table.table] = [...table.columns]
          }
        }
      }

      sqlConfig.schema = schemaMap;

      return databaseInfo;
    } catch(e) {
      console.error("Error fetching database info:", e);
    }

    return null;
  }


  /**
   * Replaces the current schema in the editor with a new schema. This is
   * invoked when the query type changes.
   */
  async replaceSchema(queryType: QueryType, view: EditorView | null | undefined) {
    if (!view) {
      console.debug("replaceSchema(): Editor view is not initialized yet. Will try again later.");
      return;
    }

    if (queryType === 'SQL' || queryType === 'SQLPlugin' || queryType === 'Application' || queryType === "SQLAccessHistory") {
      let newConfig: SQLConfig = {
        dialect: StandardSQL,
        schema: {}
      }

      let databaseInfo: DatabaseInfo | null = await this.calculateSchema(newConfig);

      if (databaseInfo) {
        this.databaseInfo.set(databaseInfo);
        this.state.databaseInfo.set(queryType, databaseInfo);
      } else {
        this.databaseInfo.set(undefined);
      }

      view?.dispatch({
        effects: this.languageCompartment.reconfigure(sql(newConfig))
      });
    } else if (queryType === "XMLFilter") {
      // For XMLFilter, we don't need a specific SQL configuration
      view?.dispatch({
        effects: this.languageCompartment.reconfigure(xml({
          autoCloseTags: true
        }))
      });
    } else {
      view?.dispatch({
        effects: this.languageCompartment.reconfigure([])
      });
    }
  }

  setContent(newContent: string) {
    if (this.editorView.hasValue()) {
      const view = this.editorView.value()
      view?.dispatch({
        changes: {from: 0, to: view.state.doc.length, insert: newContent}
      });
    }
  }

  /**
   * Event handler invoked by CodeMirror when the contents of the editor
   * changes. This should be debounced to avoid excessive updates.
   *
   * @param value The new content of the editor.
   */
  private updateContent(value: string) {
    this.codeUpdated.emit(value)
  }


}
