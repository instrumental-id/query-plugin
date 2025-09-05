import {
    AfterViewInit,
    Component, computed, ElementRef,
    inject,
    OnInit, Signal, signal,
    ViewChild, WritableSignal
} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {EditorState} from "../../../common/EditorState";
import {
    EventBus,
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
    DatabaseInfo,
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
export class Editor implements AfterViewInit, OnInit {

    protected api: API = inject(API);

    protected applications: Signal<string[]> = computed(() => {
        return this.state?.configuration().applications || [];
    });

    private databaseInfo: WritableSignal<DatabaseInfo | undefined> = signal<DatabaseInfo | undefined>(undefined);

    protected editorState: EditorState;

    @ViewChild('idwQueryPluginEditorSlot', {static: true})
    // @ts-ignore
    protected editor: ElementRef<HTMLDivElement>;

    protected eventBus: EventBus = inject(EventBus);

    protected historyService: HistoryService = inject(HistoryService);

    protected schema: Signal<string> = computed(() => {
        const dbInfo = this.databaseInfo();
        if (dbInfo) {
            return dbInfo.schema || dbInfo.catalog || '';
        }
        return '';
    });

    private languageCompartment: Compartment;

    protected state: ApplicationState = inject(ApplicationState);

    private _view?: EditorView;

    constructor() {
        this.editorState = {
            content: '',
            queryType: "SQL",
            application: undefined,
            rowLimit: 100,
            startAt: 0
        }

        this.languageCompartment = new Compartment();
    }

    async ngOnInit(): Promise<void> {
        this.eventBus.on(SOURCE_REPLACE, (event: SourceUpdatedEvent) => {
            this.replaceQuery(event.content);
        });
    }

    async ngAfterViewInit(): Promise<void> {
        let lastState = await this.historyService.loadLastEditorState();

        const code = lastState?.content ?? '';

        if (lastState) {
            this.editorState.queryType = lastState.queryType;
            this.editorState.application = lastState.application;
            this.editorState.rowLimit = lastState.rowLimit;
            this.editorState.queryClass = lastState.queryClass || '';
        }

        let compartmentExtension = this.languageCompartment.of([])

        const debouncedUpdate = debounce(1000, (content: string) => {
            this.content = content;
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

        // The actual HTML element where the editor will be rendered
        const nativeElement = this.editor.nativeElement;

        this._view = new EditorView({
            state: CMEditorState.create({
                doc: code,
                extensions: extensions,
            }),
            parent: nativeElement,
        });

        if (code) {
            this.content = code;
        }

        setTimeout(async () => {
            await this.replaceSchema()
        }, 0)
    }

    private async calculateSchema(sqlConfig: SQLConfig) {

        try {
            let databaseInfo: DatabaseInfo = await this.api.enumerateDatabase({
                type: this.editorState.queryType,
                application: this.editorState.application
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
                    type: this.editorState.queryType,
                    application: this.editorState.application
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

    clearQuery() {
        this.content = '';

        if (this._view) {
            this._view.dispatch({
                changes: {from: 0, to: this._view.state.doc.length, insert: ''}
            });
        }
    }

    async executeQuery() {
        if (this.editorState.content.trim() === '') {
            console.warn("Cannot execute an empty query.");
            return
        }

        this.state.running.set(true);

        try {
            let response = await this.api.query({
                query: this.editorState.content,
                type: this.editorState.queryType,
                application: this.editorState.application,
                limit: this.editorState.rowLimit,
                queryClass: this.editorState.queryClass,
            })

            this.eventBus.emit(QUERY_COMPLETED, response);

            await this.historyService.storeHistory(this.editorState);
        } catch (error) {
            console.error("Error executing query:", error);
            this.eventBus.emit(QUERY_ERROR, {error: error});
        } finally {
            this.state.running.set(false)
        }
    }

    async executeTranslate() {
        this.state.running.set(true);

        try {
            let response = await this.api.translateQuery({
                query: this.editorState.content,
                type: this.editorState.queryType,
                queryClass: this.editorState.queryClass
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
     * Gets the current content of the editor.
     */
    get content(): any {
        return this.editorState.content;
    }

    /**
     * Gets the current query type (SQL, HQL, etc.) from the editor state.
     */
    get type() {
        return this.editorState.queryType;
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
            this.content = newContent;

            if (this._view) {
                this._view.dispatch({
                    changes: {
                        from: 0,
                        to: this._view.state.doc.length,
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
    async replaceSchema() {
        if (this.editorState.queryType === 'SQL' || this.editorState.queryType === 'SQLPlugin' || this.editorState.queryType === 'Application' || this.editorState.queryType === "SQLAccessHistory") {
            let newConfig: SQLConfig = {
                dialect: StandardSQL,
                schema: {}
            }

            let databaseInfo: DatabaseInfo | null = await this.calculateSchema(newConfig);

            if (databaseInfo) {
                this.databaseInfo.set(databaseInfo);
                this.state.databaseInfo.set(this.editorState.queryType, databaseInfo);
            } else {
                this.databaseInfo.set(undefined);
            }

            this._view?.dispatch({
                effects: this.languageCompartment.reconfigure(sql(newConfig))
            });
        } else if (this.editorState.queryType === "XMLFilter") {
            // For XMLFilter, we don't need a specific SQL configuration
            this._view?.dispatch({
                effects: this.languageCompartment.reconfigure(xml({
                    autoCloseTags: true
                }))
            });
        } else {
            this._view?.dispatch({
                effects: this.languageCompartment.reconfigure([])
            });
        }
    }

    /**
     * Handler to set the content of the editor. Sets the value in the editor state, emits an
     * event to notify any other components that might be interested, and stores the
     * editor state in the history service.
     *
     * @param value
     */
    set content(value: any) {
        this.editorState.content = value;
        this.eventBus.emit(SOURCE_UPDATED, {content: this.editorState.content});
        this.historyService.storeEditorState(this.editorState)
    }

    async stateUpdated(field: string) {
        console.debug("Editor state updated for field:", field, "with value:", this.editorState);
        await this.historyService.storeEditorState(this.editorState)
        if (field === 'queryType') {
            await this.replaceSchema();
        }
    }
}
