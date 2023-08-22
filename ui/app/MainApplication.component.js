/**
 * A map of 'bad' HTML characters that may need escaping
 * @private
 */
let entityMap = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': '&quot;',
	"'": '&#39;',
	"/": '&#x2F;'
};

/**
 * Escapes the given string by replacing the bad HTML characters in 'entityMap' with a token
 * @private
 */
function escape(str) {
	return String(str).replace(/[&<>"'\/]/g, function (s) {
		return entityMap[s];
	});
}


class MainApplicationComponent {

	constructor(queryModuleService, $window, $timeout, $q, $scope, $uibModal, $interpolate, $log, NgTableParams) {

		this.NgTableParams = NgTableParams

		/**
		 * @type QueryModuleService
		 */
		this.queryModuleService = queryModuleService;

		this.$window = $window;
		this.$timeout = $timeout
		this.$q = $q
		this.$scope = $scope
		this.$uibModal = $uibModal
		this.$log = $log

		/**
		 * @expose
		 */
		this.limitResults = 200;

		/**
		 * @expose
		 */
		this.history = undefined;

		/**
		 * @expose
		 */
		this.query = "";

		/**
		 * @expose
		 */
		this.namedParams = {}

		/**
		 * @expose
		 */
		this.type = "HQL";

		/**
		 * @expose
		 */
		this.data = []

		/**
		 * @type {string|null}
		 * @expose
		 */
		this.host = null;

		/**
		 * @expose
		 */
		this.columnNames = []

		/**
		 * @expose
		 */
		this.errorBanner = "";

		/**
		 * @expose
		 */
		this.infoBanner = "";

		/**
		 * @expose
		 */
		this.showQueryWindow = true;

		/**
		 * @expose
		 * @type {string}
		 */
		this.queryClass = "Identity";

		this.applicationName = null;

		let lastSource = localStorage.getItem('idw.queryplugin.lastsource');
		if (lastSource) {
			let lastSourceObj = new HistoryItem(JSON.parse(lastSource))
			this.query = lastSourceObj.query
			this.type = lastSourceObj.type
		}

		/**
		 * The three filter panels that show up under the 'description' column in the ng-table
		 * @expose
		 */
		this.detailFilterDef = {
			descriptionText: {
				id: "text",
				placeholder: "Anywhere"
			},
			'descriptionObject.attribute': {
				id: "text",
				placeholder: "Attribute"
			},
			'descriptionObject.application': {
				id: "text",
				placeholder: "Application"
			}
		};

		/**
		 * The ng-table column definitions
		 * @expose
		 */
		this.cols = []

		/**
		 * This is the result from compiling a filter to HQL
		 *
		 * @expose
		 * @type {string}
		 */
		this.queryResult = "";

		/**
		 * @expose
		 * @type {string}
		 */
		this.queryShowWhich = "HQL";

		/**
		 * @expose
		 */
		this.filterOptions = {
			typeOptions: [
				"Bundle",
				"GroupDefinition",
				"TaskDefinition"
			],
			nameOptions: [],
			selectedType: "",
			selectedName: "",
			loaded: {
				id: "",
				name: "",
				type: ""
			}
		}

		this.$scope.applications = []

		this.$scope.numbersOnlyRegex = /\d+/
		this.$scope.resultselem = {}
		this.$scope.historyelem = {}

		this.$scope.$watch("ctrl.query", (newVal, oldValue) => {
			this.saveSource()
		});

		this.$scope.$watch("ctrl.type", (newVal, oldValue) => {
			if (newVal === "XMLFilter") {
				this.$scope.codeMirror.setOption("mode", "application/xml");
			} else {
				this.$scope.codeMirror.setOption("mode", "text/x-sql")
			}
		})

		this.$scope.editorOptions = {
			lineNumbers: true,
			mode: 'text/x-sql',
			readOnly: false,
			theme: 'sailpoint',
			smartIndent: true,
			indentUnit: 2,
			matchBrackets: true,
			matchClosing: true,
			styleActiveLine: true
		};

		this.$scope.onCodeMirrorLoad = (cm) => {
			this.$log.debug("CodeMirror loaded ", cm)
			this.$scope.codeMirror = cm;
		}

		this.queryModuleService.getConfiguration().then((config) => {
			this.$scope.applications = config.applications ?? []
		})

		this._commonErrorHandlerFunction = this._commonErrorHandlerFunction.bind(this)
	}


	/**
	 * @private
	 */
	clearState() {
		this.errorBanner = "";
		this.infoBanner = "";
		this.queryResult = "";
		this.host = null;
		this.cols = [];
		this.data = [];
		this.$scope.querySql = "";
		this.$scope.queryXmlFilter = "";
		this.$scope.queryFilter = "";
	}

	/**
	 * @private
	 * @param sql {string}
	 * @return {string}
	 */
	formatSql(sql) {
		sql = sql.replaceAll(/:param[0-9]+/ig, "?")
		let formatted = this.$window.sqlFormatter.format(sql, {
			language: 'mysql'
		});
		let html = escape(formatted);
		let container = {
			count: 0
		};
		html = html.replace(/\?/g, (match, p1) => {
			let idx = container.count++;
			// I'm using 'value' here instead of a data-* attribute because AngularJS filters out data-* attrs in ng-bind-html
			// See here: https://stackoverflow.com/questions/27348558/why-does-angularjs-strip-out-data-attributes-when-using-ng-bind-html
			return "<span class='param' value='" + idx + "'>?</span>"
		});

		return html;
	}

	/**
	 * In the translate view, shows the bound variables
	 * @param variables
	 */
	showBoundVariables(variables) {
		let $ = jQuery;
		$("div.hql-result span.param").each(function() {
			let idx = $(this).attr("value")
			let value = variables["param" + idx]
			$(this).after(`<span class="paramValue nocopy">${value}</span>`)
		})
		$("div.sql-result span.param").each(function() {
			let idx = $(this).attr("value")
			let value = variables["param" + idx]
			$(this).after(`<span class="paramValue nocopy">${value}</span>`)
		})
	}

	/**
	 * @private
	 * @param error {*}
	 */
	_commonErrorHandlerFunction(error) {
		this.clearState()
		this.$scope.submitting = false;
		let data = error.data;
		this.$log.error(data);
		if (data.message) {
			this.errorBanner = data.message
		} else {
			this.errorBanner = data.exception
		}
		this.$scope.resultselem.open = true
		this.$scope.tableParams = undefined
	}

	/**
	 * @private
	 */
	saveSource() {
		let sourceMap = new HistoryItem({
			"query": this.query,
			"type": this.type
		})

		localStorage.setItem('idw.queryplugin.lastsource', sourceMap.toJSON());
	}


	/**
	 * @private
	 */
	saveHistory() {
		let historyStr = localStorage.getItem("idw.queryplugin.executionhistory") || "[]"
		let history = JSON.parse(historyStr)

		let execution = {
			date: new Date().toISOString(),
			query: this.query,
			type: this.type
		}

		let foundIndex;
		do {
			foundIndex = -1;
			for(let index in history) {
				let historyItem = history[index]
				if (historyItem.query === execution.query && historyItem.type === execution.type) {
					foundIndex = index;
					break;
				}
			}

			if (foundIndex >= 0) {
				history.splice(foundIndex, 1)
			}
		} while(foundIndex >= 0);

		history.push(execution)
		localStorage.setItem("idw.queryplugin.executionhistory", JSON.stringify(history))

		this.history = history
	}


	/**
	 * @param {any} historyItemInput
	 * @expose
	 */
	restoreHistory(historyItemInput) {
		let historyItem = new HistoryItem(historyItemInput)
		this.query = historyItem.query;
		this.type = historyItem.type;
	}

	/**
	 * @expose
	 */
	getHistoryItems() {
		if (this.history === undefined || this.history === null) {
			let historyStr = localStorage.getItem("idw.queryplugin.executionhistory") || "[]"
			this.history = JSON.parse(historyStr)
		}
		return this.history
	}

	showFilterModal() {
		let modalInstance = this.$uibModal.open({
			templateUrl: 'loadFilterSelectionModal.html',
			controller: 'LoadObjectModalController',
			size: 'lg',
			resolve: {
				state: () => {
					return {
						loadNames: this.loadFilterNames,
						availableTypes: this.filterOptions.typeOptions
					}
				}
			}
		});

		modalInstance.result.then((output) => {
			this.filterOptions.selectedType = output.selectedType;
			this.filterOptions.selectedName = output.selectedName;
			this.loadFilter()
		}, () => {
			this.$log.debug('Modal dismissed at: ' + new Date());
		});
	}

	loadFilterNames() {
		if (this.filterOptions.selectedType !== undefined && this.filterOptions.selectedType !== "") {
			this.filterOptions.selectedType = selectedType;
			let request = this.queryModuleService.loadFilterOptions(this.filterOptions.selectedType);
			return request.then(
				(results) => {
					this.filterOptions.nameOptions = results["names"]
					return this.filterOptions.nameOptions
				},
				this._commonErrorHandlerFunction
			)
		}
	}
	loadFilter() {
		this.clearState()
		let request = this.queryModuleService.loadFilter(this.filterOptions.selectedType, this.filterOptions.selectedName);
		if (request) {
			request.then(
				(results) => {
					this.query = results["filter"]
					this.type = "Filter"
					this.filterOptions.loaded.id = results["id"]
					this.filterOptions.loaded.name = results["name"]
					this.filterOptions.loaded.type = results["type"]
				},
				this._commonErrorHandlerFunction
			)
		}
	}

	/**
	 * @expose
	 */
	getFilterHql() {
		if (this.type === "Filter" || this.type === "XMLFilter") {
			saveSource();
			saveHistory();
			clearState()
			this.$log.debug("Querying for HQL equivalent to ", this.query)
			let request = this.queryModuleService.translateFilter(this.query, this.queryClass);
			if (request) {
				this.cols = []
				this.$scope.submitting = true;
				request.then((results) => {
					this.$scope.submitting = false;
					if ("query" in results) {
						this.queryResult = formatSql(results["query"]);
						this.$scope.resultselem.open = true
						if ("params" in results) {
							this.$scope.queryParams = results["params"]
						}
						if ("sql" in results) {
							this.$scope.querySql = formatSql(results["sql"])
						}
						this.$scope.queryFilter = results["filter"]
						this.$scope.queryXmlFilter = results["xmlFilter"]
						this.queryShowWhich = "HQL"
						this.$timeout(() => {
							this.showBoundVariables(this.$scope.queryParams)
						}, 100)
					} else {
						this.infoBanner = "No response from the Filter to HQL compiler"
					}
				},
					this._commonErrorHandlerFunction
				)
			}
		} else if (this.type === "HQL") {
			this.saveSource();
			this.saveHistory();
			this.clearState();
			this.$log.debug("Querying for SQL equivalent to ", this.query)
			let request = this.queryModuleService.translateHql(this.query);
			if (request) {
				this.cols = []
				this.$scope.submitting = true;
				request.then((results) => {
					this.$scope.submitting = false;
					if ("sql" in results) {
						this.queryResult = this.formatSql(results["query"]);
						this.$scope.resultselem.open = true
						if ("sql" in results) {
							this.$scope.querySql = this.formatSql(results["sql"])
						}
						this.queryShowWhich = "HQL"
						this.$timeout(() => {
							this.showBoundVariables(this.$scope.queryParams)
						}, 100)
					} else {
						this.infoBanner = "No response from the HQL to SQL compiler"
					}
				}, this._commonErrorHandlerFunction)
			}
		} else {
			this.$log.error("Query class is not a valid type; how did you get here?")
		}
	}

	/**
	 * Executes the query and sets up the handlers to display the results
	 * @expose
	 */
	submitQuery() {
		this.saveSource();
		this.saveHistory();
		let request = this.queryModuleService.runQuery(this.query, this.type, this.limitResults, this.queryClass, this.applicationName)
		if (request) {
			this.clearState()
			this.$scope.submitting = true;
			request.then((results) => {
				this.$scope.submitting = false;
				if (results !== undefined) {
					let columns = []
					let data = undefined
					if (results["data"] && results["data"].length > 0) {
						if (results["columns"] && results["columns"].length > 0) {
							data = results["data"]
							columns = results["columns"]
						} else {
							let firstRow = results["data"][0];
							if (firstRow) {
								for(let column in firstRow) {
									if (firstRow.hasOwnProperty(column)) {
										columns.push(column)
									}
								}
								data = results["data"]
							}
						}
						this.$log.debug("Result columns: ", columns)

						if (columns) {
							this.columnNames = columns
							this.host = results["host"]
							this.data = data

							let ngTableColumns = []
							for(let column of columns) {
								let filters = {}
								filters[column] = "text"
								ngTableColumns.push({
									field: column,
									title: column,
									sortable: column,
									show: true,
									filter: filters
								})
							}

							this.cols = ngTableColumns

							this.$scope.tableParams =
								new (this.NgTableParams)(
										{
											// Page we start on
											page: 1,
											// Items per page
											count: 50
										},
										{
											// How many page number selectors show up at the bottom?
											paginationMaxBlocks: 7,
											paginationMinBlocks: 2,
											// The 'Description' field has multiple filters; this lines them up horizontally instead of stacking
											filterOptions: { filterLayout: "horizontal" },
											dataset: data
										});
						} else {
							this.infoBanner = "Unable to extract column names from data set?"
						}
					} else {
						this.infoBanner = "No results found matching this query."
					}
				} else {
					this.infoBanner = "No results found matching this query."
				}
				this.$scope.resultselem.open = true
			}, this._commonErrorHandlerFunction)
		}
	}


}


/**
 * The AngularJS controller for this application
 * @ngInject
 */

queryModule.component('queryApplication',
	{
		templateUrl: function () {
			return PluginHelper.getPluginFileUrl("IDWQueryPlugin", "ui/app/mainApplication.html")
		},
		controller: MainApplicationComponent
	}
)
