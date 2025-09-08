import {
    Component, computed, effect, ElementRef,
    inject, model,
    resource, Signal, signal, viewChild,
    WritableSignal
} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {EditorState} from "../../../common/EditorState";
import {
    EventBus, HISTORY_ITEM_LOADED,
    QUERY_COMPLETED,
    QUERY_ERROR,
    SOURCE_REPLACE,
    SOURCE_UPDATED,
    SourceUpdatedEvent, TRANSLATE_COMPLETED
} from "../../../services/EventBus";
import {
    Extension,
    EditorState as CMEditorState,
    Compartment
} from "@codemirror/state";
import {
    MSSQL,
    MySQL,
    sql,
    SQLConfig,
    SQLDialect,
    StandardSQL
} from '@codemirror/lang-sql';
import {minimalSetup} from 'codemirror';
import {autocompletion, closeBrackets} from "@codemirror/autocomplete";
import {vscodeLight} from '@uiw/codemirror-theme-vscode';
import {defaultKeymap} from "@codemirror/commands";
import {highlightSelectionMatches} from "@codemirror/search";
import {EditorView, highlightActiveLine, ViewUpdate} from "@codemirror/view";
import {ApplicationState} from "../../../services/ApplicationState";
import {
    API,
    DatabaseInfo, QueryType,
    TableInfo
} from "../../../services/API";


import {
    keymap, lineNumbers
} from "@codemirror/view"
import {
    bracketMatching,
    defaultHighlightStyle,
    syntaxHighlighting
} from "@codemirror/language";
import {debounce} from "../../../common/QueryPluginUtils";
import {HistoryService} from "../../../services/HistoryService";
import {xml} from "@codemirror/lang-xml";

interface SchemaMap {
    [table: string]: string[];
}


@Component({
    selector: 'qp-editor',
    templateUrl: './editor.html',
    imports: [
        FormsModule
    ],
    standalone: true,
    styleUrl: './editor.scss'
})
export class Editor {

    /**
     * The currently selected application for the query.
     */
    protected application = model<string | undefined>(undefined)

    /**
     * List of available applications from the application state configuration.
     */
    protected readonly applications: Signal<string[]> = computed(() => {
        return this.state?.configuration().applications || [];
    });

    /**
     * Information about the connected database, including schema and catalog.
     */
    protected readonly databaseInfo: WritableSignal<DatabaseInfo | undefined> = signal<DatabaseInfo | undefined>(undefined);

    /**
     * The content of the query editor.
     */
    protected content = model('')

    /**
     * Reference to the editor's DOM element.
     */
    protected editor = viewChild<ElementRef<HTMLDivElement>>('idwQueryPluginEditorSlot')

    /**
     * Resource for the CodeMirror editor view instance.
     */
    private readonly editorView = resource({
        params: () => ({nativeElement: this.editor()?.nativeElement}),
        loader: ({params}) => this.initializeView(params),
    })

    /**
     * The current editor state, including content, query type, row limit, etc.
     * Recalculated by Angular whenever any of the nested signal values change.
     */
    protected readonly editorState: Signal<EditorState> = computed(() => {
        return {
            content: this.content(),
            queryType: this.queryType(),
            rowLimit: this.rowLimit(),
            startAt: this.startAt(),
            application: this.application(),
            queryClass: this.queryClass()
        }
    })

    /**
     * The query class, if any, for advanced query types.
     */
    protected queryClass = model<string | undefined>(undefined)

    /**
     * The type of query being edited (e.g., SQL, HQL).
     */
    protected queryType = model('SQL' as QueryType)

    /**
     * The maximum number of rows to return from a query.
     */
    protected rowLimit = model<number | undefined>(100)

    /**
     * The starting row offset for the query.
     */
    protected startAt = model<number | undefined>(0)

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

    /**
     * API service for querying and schema enumeration.
     */
    protected readonly api: API = inject(API);

    /**
     * Event bus for emitting and listening to editor-related events.
     */
    private readonly eventBus: EventBus = inject(EventBus);

    /**
     * Service for managing query and editor history.
     */
    private readonly historyService: HistoryService = inject(HistoryService);

    /**
     * Compartment for dynamically reconfiguring the editor's language mode.
     */
    private languageCompartment: Compartment = new Compartment();

    /**
     * Application state service for global state management.
     */
    protected readonly state: ApplicationState = inject(ApplicationState);

    constructor() {
        this.eventBus.on(SOURCE_REPLACE, (event: SourceUpdatedEvent) => {
            this.replaceQuery(event.content);
        });

        this.eventBus.on(HISTORY_ITEM_LOADED, (event: EditorState) => {
            this.queryType.set(event.queryType)
            this.application.set(event.application)
            this.rowLimit.set(event.rowLimit)
            this.queryClass.set(event.queryClass || '')
            this.replaceQuery(event.content);
        })

        effect(() => {
            this.stateUpdated(this.editorState())
        })

        effect(() => {
            this.replaceSchema(this.queryType(), this.editorView?.value());
        })

        effect(() => {
            let type = this.queryType();
            if (type === "HQL" || type === "SQL" || type == "SQLPlugin" || type === "SQLAccessHistory" || type === "Application") {
                this.queryClass.set(undefined);
            }
        })
    }

    /**
     * Initializes the CodeMirror editor view with the given parameters.
     * @param params Parameters including the native DOM element to attach the editor to.
     * @returns A promise that resolves to the initialized EditorView instance.
     * @private
     */
    private async initializeView(params: any): Promise<EditorView> {
        const nativeElement = params.nativeElement as HTMLDivElement

        let lastState = await this.historyService.loadLastEditorState();

        const code = lastState?.content ?? '';

        if (lastState) {
            this.queryType.set(lastState.queryType)
            this.application.set(lastState.application)
            this.rowLimit.set(lastState.rowLimit)
            this.queryClass.set(lastState.queryClass || '')
        }

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
     * Clears the current query content from both the editor state and the CodeMirror view.
     */
    clearQuery() {
        this.content.set('');

        if (this.editorView.hasValue()) {
            const view = this.editorView.value()
            view.dispatch({
                changes: {from: 0, to: view.state.doc.length, insert: ''}
            });
        }
    }

    /**
     * Executes the current query by sending it to the API service.
     * Emits events on completion or error.
     */
    async executeQuery() {
        if (this.content()?.trim() === '') {
            console.warn("Cannot execute an empty query.");
            return
        }

        this.state.running.set(true);

        try {
            let response = await this.api.query({
                query: this.content() ?? "",
                type: this.queryType() ?? "SQL",
                application: this.application(),
                limit: this.rowLimit(),
                queryClass: this.queryClass(),
            })

            this.eventBus.emit(QUERY_COMPLETED, response);

            await this.historyService.storeHistory(this.editorState())
        } catch (error) {
            console.error("Error executing query:", error);
            this.eventBus.emit(QUERY_ERROR, {error: error});
        } finally {
            this.state.running.set(false)
        }
    }

    /**
     * Executes a translation of the current query by sending it to the API service.
     * Emits events on completion or error.
     */
    async executeTranslate() {
        this.state.running.set(true);

        try {
            let response = await this.api.translateQuery({
                query: this.content() ?? "",
                type: this.queryType() ?? "SQL",
                queryClass: this.queryClass()
            });

            this.eventBus.emit(TRANSLATE_COMPLETED, response);
        } catch (error) {
            console.error("Error executing translate:", error);
            this.eventBus.emit(QUERY_ERROR, {error: error});
        } finally {
            this.state.running.set(false);
        }
    }

    /**
     * Gets the current query type (SQL, HQL, etc.) from the editor state.
     */
    get type() {
        return this.queryType();
    }

    /**
     * Replaces the current query content with the new content. Invoked by the event bus
     * when the user clicks on a historical query to load it.
     *
     * @param newContent The new content to replace the current query with. If null, it will clear the query.
     */
    replaceQuery(newContent: string | null) {
        if (newContent === null) {
            this.clearQuery();
        } else {
            this.updateContent(newContent);

            if (this.editorView.hasValue()) {
                const view = this.editorView.value()
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: newContent
                    }
                });
            }
        }
    }

    /**
     * Replaces the current schema in the editor with a new schema. This is
     * invoked when the query type changes.
     */
    async replaceSchema(queryType: QueryType, view: EditorView | undefined) {
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

    /**
     * Event handler invoked by CodeMirror when the contents of the editor
     * changes. This should be debounced to avoid excessive updates.
     *
     * @param value The new content of the editor.
     */
    private updateContent(value: string) {
        this.content.set(value)
        this.eventBus.emit(SOURCE_UPDATED, {content: this.content()});
        this.historyService.storeEditorState(this.editorState())
    }

    /**
     * Handler invoked when any part of the editor state is updated. It stores the new state
     * in the history service and, if the query type changed, it also updates the schema.
     *
     * TODO replace this with an effect()
     *
     * @param field The field of the editor state that was updated.
     */
    async stateUpdated(contents: EditorState) {
        console.debug("Editor state updated with value:", this.editorState());
        await this.historyService.storeEditorState(contents)
    }
}
