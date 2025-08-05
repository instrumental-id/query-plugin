import {
    AfterViewInit,
    Component, computed,
    inject,
    Input,
    OnInit, Signal,
    viewChild,
    ViewChild
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
import {Extension, EditorState as CMEditorState} from "@codemirror/state";
import {sql, SQLConfig} from '@codemirror/lang-sql';
import {basicSetup} from 'codemirror';
import {vscodeLight} from '@uiw/codemirror-theme-vscode';
import {defaultKeymap} from "@codemirror/commands";
import {EditorView, ViewUpdate} from "@codemirror/view";
import {ApplicationState} from "../../../services/ApplicationState";
import {API, DatabaseInfo} from "../../../services/API";


import {
    keymap, lineNumbers
} from "@codemirror/view"
import {defaultHighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {debounce} from "../../../common/QueryPluginUtils";
import {HistoryService} from "../../../services/HistoryService";


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

    protected editorState: EditorState;

    protected editor: any = viewChild('div.idwQueryPluginEditorSlot');

    protected eventBus: EventBus = inject(EventBus);

    protected historyService: HistoryService = inject(HistoryService);

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
    }

    async ngOnInit(): Promise<void> {
        this.eventBus.on(SOURCE_REPLACE, (event: SourceUpdatedEvent) => {
            this.replaceQuery(event.content);
        });
    }

    async ngAfterViewInit(): Promise<void> {
        const nativeElement = this.editor.nativeElement;

        let databaseInfo: DatabaseInfo = await this.api.enumerateDatabase();

        let sqlConfig: SQLConfig = {
            schema: {}
        }

        const myExt: Extension = [
            basicSetup,
            sql(),
            vscodeLight,
            lineNumbers(),
            syntaxHighlighting(defaultHighlightStyle),
            keymap.of(defaultKeymap)
        ];

        let state!: CMEditorState;

        try {
            state = CMEditorState.create({
                doc: '',
                extensions: myExt,
            });
        } catch (e) {
            console.error(e);
            throw new Error("Failed to create editor state: " + e);
        }

        this._view = new EditorView({
            state,
            parent: nativeElement,
        });

        EditorView.updateListener.of((v: ViewUpdate) => debounce(1000, () => {
            if (v.docChanged) {
                this.content = v.state.doc.toString();
            }
        }));

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
        this.state.running.set(true);

        try {
            let response = await this.api.query({
                query: this.editorState.content,
                queryType: this.editorState.queryType,
                application: this.editorState.application,
                limit: this.editorState.rowLimit,
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
                queryType: this.editorState.queryType
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
     * Gets the available JDBC applications (IIQ apps to query) from the application state.
     */
    get applications(): string[] {
        return this.state?.configuration?.applications ?? [];
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

}
