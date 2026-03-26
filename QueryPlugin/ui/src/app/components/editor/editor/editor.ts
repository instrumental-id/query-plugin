import {
    Component, computed, effect,
    inject, model,
    resource, signal, Signal, viewChild, WritableSignal
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
import {ApplicationState} from "../../../services/ApplicationState";
import {
    API, QueryType,
} from "../../../services/API";
import {Formatter} from "../../../common/Formatter";


import {HistoryService} from "../../../services/HistoryService";
import {EditorButtons} from "../editor-buttons/editor-buttons";
import {CodemirrorEditor} from "../codemirror-editor/codemirror-editor";
import {NgClass} from "@angular/common";
import {toggleSignal} from "../../../common/utils";

@Component({
    selector: 'qp-editor',
    templateUrl: './editor.html',
    imports: [
        FormsModule,
        EditorButtons,
        CodemirrorEditor,
        NgClass
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
     * The content of the query editor.
     */
    protected content = model('')

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

    protected editorComponent = viewChild<CodemirrorEditor>('codemirrorEditor')

    protected errorField: WritableSignal<string | null> = signal<string | null>(null)

    protected extraOptions: WritableSignal<boolean> = signal<boolean>(false)

    lastEditorState: WritableSignal<EditorState | null | undefined> = signal<EditorState | null | undefined>(undefined)

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
     * Application state service for global state management.
     */
    protected readonly state: ApplicationState = inject(ApplicationState);

    protected readonly formatter: Formatter = new Formatter();
    
    /**
     * Utility function to toggle boolean signals. Reference the global utility
     * function here so that it's accessible in the template.
     * @protected
     */
    protected readonly toggleSignal: typeof toggleSignal = toggleSignal;

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
            console.debug("Editor state updated with value:", this.editorState());
            this.historyService.storeEditorState(this.editorState())
        })

        effect(() => {
            let type = this.queryType();
            if (!(type === "Filter" || type === "XMLFilter")) {
                this.queryClass.set(undefined);
            }

            if (type !== "Application") {
                this.application.set(undefined);
            }
        })

        this.historyService.loadLastEditorState().then((lastState) => {
            if (lastState) {
                console.debug("Loaded last editor state from history service:", lastState);
                this.lastEditorState.set(lastState)

                console.debug("Restoring last editor state:", lastState);
                this.queryType.set(lastState.queryType)
                this.application.set(lastState.application)
                this.rowLimit.set(lastState.rowLimit)
                this.queryClass.set(lastState.queryClass || '')
                this.onCodeUpdated(lastState.content)
            } else {
                this.lastEditorState.set(null)
            }
        })

    }

    /**
     * Clears the current query content from both the editor state and the CodeMirror view.
     */
    clearQuery() {
        this.content.set('');

        this.editorComponent()?.setContent('');
    }

    /**
     * Executes the current query by sending it to the API service.
     * Emits events on completion or error.
     */
    async executeQuery() {
        this.editorComponent()?.syncContent();

        if (this.content()?.trim() === '') {
            console.warn("Cannot execute an empty query.");
            return
        }

        this.errorField.set(null);

        let queryClass = this.queryClass() ?? ""
        let type = this.queryType() ?? ""

        let application = this.application() ?? ""

        if (type === "Filter" || type === "XMLFilter") {
            if (!queryClass) {
                this.errorField.set("queryClass");
                this.eventBus.emit(QUERY_ERROR, {error: new Error("Filter Class is required for Filter and XMLFilter query types.")});
                return;
            }
        } else if (type === "Application") {
            if (!application) {
                this.errorField.set("application");
                this.eventBus.emit(QUERY_ERROR, {error: new Error("Select an Application to run a query.")});
                return;
            }
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

    async executeFormat() {
        let queryType = this.queryType();
        if (queryType === "Application" || queryType === "SQL" || queryType === "SQLPlugin" || queryType === "SQLAccessHistory") {
            let formatted = this.formatter.formatSql(this.content())

            this.replaceQuery(formatted.formatted)

            // TODO: handle parse warnings and display them to the user in some way
        } else if (queryType === "XMLFilter") {
            let formatted = this.formatter.formatXml(this.content())
            this.replaceQuery(formatted)
        } else {
            console.warn("Formatting is only supported for SQL query types. Current type:", queryType);
        }
    }

    /**
     * Executes a translation of the current query by sending it to the API service.
     * Emits events on completion or error.
     */
    async executeTranslate() {
        let queryClass = this.queryClass() ?? ""

        this.errorField.set(null);

        if (!queryClass) {
            this.errorField.set("queryClass");
            this.eventBus.emit(QUERY_ERROR, {error: new Error("Filter Class is required for translation.")});
            return;
        }

        let type = this.queryType() ?? ""
        if (!(type === "Filter" || type === "XMLFilter" || type === "HQL")) {
            this.errorField.set("queryType");
            this.eventBus.emit(QUERY_ERROR, {error: new Error("Query type must be 'HQL', 'Filter' or 'XMLFilter' for translation.")});
            return;
        }

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

            this.editorComponent()?.setContent(newContent);
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
     * Replaces the current code when the editor indicates that a change has been made
     * @param newSource
     */
    onCodeUpdated(newSource: string) {
        this.updateContent(newSource);
    }

    onQueryTypeChange($event: any) {
        this.errorField.set(null);
    }

}
