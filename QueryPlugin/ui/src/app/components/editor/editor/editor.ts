import {
    Component, computed, effect, ElementRef,
    inject, model,
    resource, Signal, signal, viewChild,
    WritableSignal
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

    protected application = model<string | undefined>(undefined)

    protected readonly applications: Signal<string[]> = computed(() => {
        return this.state?.configuration().applications || [];
    });

    protected readonly databaseInfo: WritableSignal<DatabaseInfo | undefined> = signal<DatabaseInfo | undefined>(undefined);

    protected content = model('')

    protected editor = viewChild<ElementRef<HTMLDivElement>>('idwQueryPluginEditorSlot')

    private editorView = resource({
        params: () => ({nativeElement: this.editor()?.nativeElement}),
        loader: ({params}) => this.initializeView(params),
    })

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

    protected queryClass = model<string | undefined>(undefined)

    protected queryType = model('SQL' as QueryType)

    protected rowLimit = model<number | undefined>(100)

    protected startAt = model<number | undefined>(0)

    protected schema: Signal<string> = computed(() => {
        const dbInfo = this.databaseInfo();
        if (dbInfo) {
            return dbInfo.schema || dbInfo.catalog || '';
        }
        return '';
    });

    protected readonly api: API = inject(API);

    protected eventBus: EventBus = inject(EventBus);

    protected historyService: HistoryService = inject(HistoryService);

    private languageCompartment: Compartment = new Compartment();

    protected state: ApplicationState = inject(ApplicationState);

    constructor() {
        this.eventBus.on(SOURCE_REPLACE, (event: SourceUpdatedEvent) => {
            this.replaceQuery(event.content);
        });
    }

    async initializeView(params: any): Promise<EditorView> {
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
            await this.replaceSchema()
        }, 0)

        return view;
    }

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

    clearQuery() {
        this.content.set('');

        if (this.editorView.hasValue()) {
            const view = this.editorView.value()
            view.dispatch({
                changes: {from: 0, to: view.state.doc.length, insert: ''}
            });
        }
    }

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
    async replaceSchema() {
        let queryType : QueryType | undefined = this.queryType();
        const view = this.editorView.value();

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
     * Handler to set the content of the editor. Sets the value in the editor state, emits an
     * event to notify any other components that might be interested, and stores the
     * editor state in the history service.
     *
     * @param value
     */
    private updateContent(value: any) {
        this.content.set(value)
        this.eventBus.emit(SOURCE_UPDATED, {content: this.content()});
        this.historyService.storeEditorState(this.editorState())
    }

    async stateUpdated(field: string) {
        console.debug("Editor state updated for field:", field, "with value:", this.editorState);
        await this.historyService.storeEditorState(this.editorState())
        if (field === 'queryType') {
            await this.replaceSchema();
        }
    }
}
