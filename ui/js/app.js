/**
 * Angular module to implement the IdentityIQ History page by IdentityWorksLLC
 * https://www.identityworksllc.com
 */
// Are all these necessary? Probably not...
let queryModule = angular.module('QueryPluginModule',  ['ui.bootstrap', 'sailpoint.modal', 'ui.codemirror', 'ngTable', 'ngCsv']);

/**
 * Fix for the SailPoint CSRF token issue, as demonstrated in TodoPlugin v3
 */
queryModule.config(['$httpProvider', function($httpProvider) {  
	$httpProvider.defaults.xsrfCookieName = "CSRF-TOKEN";
}]);

/**
 * @returns The given value if not empty, or the default value (the first param) if it is empty
 */
queryModule.filter('ifEmpty', function() {
	return function(input, defaultValue) {
		if (angular.isUndefined(input) || input === null || input === '') {
			return defaultValue;
		}

		return input;
	}
});

queryModule.filter('reverse', function() {
	return function(items) {
		if (!items) {
			return items;
		}
		if (!angular.isArray(items)) {
			return false;
		}
		
		return items.slice().reverse();
	};
});

queryModule.filter('limit', function () {
    return function (content, length, tail) {
        if (isNaN(length))
            length = 50;
 
        if (tail === undefined)
            tail = "...";
 
        if (content.length <= length || content.length - tail.length <= length) {
            return content;
        }
        else {
            return String(content).substring(0, length-tail.length) + tail;
        }
    };
});

/**
 * @public
 * @param el {HTMLElement}
 */
function handleHideCopy(el) {
	let $ = jQuery;
	$(el).addClass('copying');
	let innerHtml = el.innerHTML;
	$(el).find('.nocopy').remove();
	setTimeout(function(){
		$(el).removeClass('copying');
		$(el).children().remove();
		el.innerHTML = innerHtml;
	},0);
}

/**
 * The AngularJS controller for this application
 * @ngInject
 */
function QueryModuleController(queryModuleService, $window, $timeout, $q, $scope, $uibModal, $interpolate, $log, NgTableParams) {

	let me = this;
	
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

	/**
	 * @private
	 * @param sql {string}
	 * @return {string}
	 */
	function formatSql(sql) {
		sql = sql.replaceAll(/:param[0-9]+/ig, "?")
		let formatted = $window.sqlFormatter.format(sql, {
			language: 'mysql'
		});
		let html = escape(formatted);
		let container = {
			count: 0
		};
		html = html.replace(/\?/g, function(match, p1) {
			let idx = container.count++;
			// I'm using 'value' here instead of a data-* attribute because AngularJS filters out data-* attrs in ng-bind-html
			// See here: https://stackoverflow.com/questions/27348558/why-does-angularjs-strip-out-data-attributes-when-using-ng-bind-html
			return "<span class='param' value='" + idx + "'>?</span>"
		});

		return html;
	}

	function showBoundVariables(variables) {
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
	 */
	function clearState() {
		me.errorBanner = "";
		me.infoBanner = "";
		me.queryResult = "";
		me.host = null;
		me.cols = [];
		me.data = [];
		$scope.querySql = "";
		$scope.queryXmlFilter = "";
		$scope.queryFilter = "";
	}

	/**
	 * @private
	 * @param error {*}
	 */
	function commonErrorHandlerFunction(error) {
		clearState()
		$scope.submitting = false;
		let data = error.data;
		$log.error(data);
		if (data.message) {
			me.errorBanner = data.message
		} else {
			me.errorBanner = data.exception
		}
		$scope.resultselem.open = true
		$scope.tableParams = undefined
	}

	/**
	 * @private
	 */
	function saveSource() {
		let sourceMap = {
			"query": me.query,
			"type": me.type
		}
		localStorage.setItem('idw.queryplugin.lastsource', JSON.stringify(sourceMap));
	}


	/**
	 * @private
	 */
	function saveHistory() {
		let historyStr = localStorage.getItem("idw.queryplugin.executionhistory") || "[]"
		let history = JSON.parse(historyStr)

		let execution = {
			date: new Date().toISOString(),
			query: me.query,
			type: me.type
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

		me.history = history
	}


	/**
	 * @expose
	 */
	me.restoreHistory = function(historyItem) {
		me.query = historyItem.query;
		me.type = historyItem.type;
	}
	
	/**
	 * @expose
	 */
	me.getHistoryItems = function() {
		if (me.history === undefined || me.history === null) {
			let historyStr = localStorage.getItem("idw.queryplugin.executionhistory") || "[]"
			me.history = JSON.parse(historyStr)
		}
		return me.history
	}

	/**
	 * @expose
	 */
	me.limitResults = 200;
	
	/**
	 * @expose
	 */
	me.history = undefined;
	
	/**
	 * @expose
	 */
	me.query = "";
	
	/**
	 * @expose
	 */
	me.namedParams = {}
	
	/**
	 * @expose
	 */
	me.type = "HQL";

	/**
	 * @expose
	 */	
	me.data = []

	/**
	 * @type {string|null}
	 * @expose
	 */
	me.host = null;
	
	/**
	 * @expose
	 */
	me.columnNames = []
	
	/**
	 * @expose
	 */
	me.errorBanner = "";
	
	/**
	 * @expose
	 */
	me.infoBanner = "";
	
	/**
	 * @expose
	 */
	me.showQueryWindow = true;

	/**
	 * @expose
	 * @type {string}
	 */
	me.queryClass = "Identity";

	me.applicationName = null;
	
	let lastSource = localStorage.getItem('idw.queryplugin.lastsource');
	if (lastSource) {
		let lastSourceObj = JSON.parse(lastSource)
		me.query = lastSourceObj["query"];
		me.type = lastSourceObj["type"];
	}

	/**
	 * The three filter panels that show up under the 'description' column in the ng-table
	 * @expose
	 */
	me.detailFilterDef = {
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
	me.cols = []

	/**
	 * This is the result from compiling a filter to HQL
	 *
	 * @expose
	 * @type {string}
	 */
	me.queryResult = "";

	/**
	 * @expose
	 * @type {string}
	 */
	me.queryShowWhich = "HQL";

	/**
	 * @expose
	 */
	me.filterOptions = {
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

	me.showFilterModal = function() {
		let modalInstance = $uibModal.open({
			templateUrl: 'loadFilterSelectionModal.html',
			controller: 'LoadObjectModalController',
			size: 'lg',
			resolve: {
				state: function () {
					return {
						loadNames: me.loadFilterNames,
						availableTypes: me.filterOptions.typeOptions
					}
				}
			}
		});

		modalInstance.result.then(function (output) {
			me.filterOptions.selectedType = output.selectedType;
			me.filterOptions.selectedName = output.selectedName;
			me.loadFilter()
		}, function () {
			$log.debug('Modal dismissed at: ' + new Date());
		});
	}

	me.loadFilterNames = function(selectedType) {
		if (selectedType !== undefined && selectedType !== "") {
			me.filterOptions.selectedType = selectedType;
			let request = queryModuleService.loadFilterOptions(me.filterOptions.selectedType);
			return request.then(
				function (results) {
					me.filterOptions.nameOptions = results["names"]
					return me.filterOptions.nameOptions
				},
				commonErrorHandlerFunction
			)
		}
	}

	me.loadFilter = function() {
		clearState()
		let request = queryModuleService.loadFilter(me.filterOptions.selectedType, me.filterOptions.selectedName);
		if (request) {
			request.then(
				function(results) {
					me.query = results["filter"]
					me.type = "Filter"
					me.filterOptions.loaded.id = results["id"]
					me.filterOptions.loaded.name = results["name"]
					me.filterOptions.loaded.type = results["type"]
				},
				commonErrorHandlerFunction
			)
		}
	}

	/**
	 * @expose
	 */
	me.getFilterHql = function() {
		if (me.type === "Filter" || me.type === "XMLFilter") {
			saveSource();
			saveHistory();
			clearState()
			$log.debug("Querying for HQL equivalent to ", me.query)
			let request = queryModuleService.translateFilter(me.query, me.queryClass);
			if (request) {
				me.cols = []
				$scope.submitting = true;
				request.then(function (results) {
					$scope.submitting = false;
					if ("query" in results) {
						me.queryResult = formatSql(results["query"]);
						$scope.resultselem.open = true
						if ("params" in results) {
							$scope.queryParams = results["params"]
						}
						if ("sql" in results) {
							$scope.querySql = formatSql(results["sql"])
						}
						$scope.queryFilter = results["filter"]
						$scope.queryXmlFilter = results["xmlFilter"]
						me.queryShowWhich = "HQL"
						$timeout(function () {
							showBoundVariables($scope.queryParams)
						}, 100)
					} else {
						me.infoBanner = "No response from the Filter to HQL compiler"
					}
				}, commonErrorHandlerFunction)
			}
		} else if (me.type === "HQL") {
			saveSource();
			saveHistory();
			clearState();
			$log.debug("Querying for SQL equivalent to ", me.query)
			let request = queryModuleService.translateHql(me.query);
			if (request) {
				me.cols = []
				$scope.submitting = true;
				request.then(function (results) {
					$scope.submitting = false;
					if ("sql" in results) {
						me.queryResult = formatSql(results["query"]);
						$scope.resultselem.open = true
						if ("sql" in results) {
							$scope.querySql = formatSql(results["sql"])
						}
						me.queryShowWhich = "HQL"
						$timeout(function () {
							showBoundVariables($scope.queryParams)
						}, 100)
					} else {
						me.infoBanner = "No response from the HQL to SQL compiler"
					}
				}, commonErrorHandlerFunction)
			}
		} else {
			$log.error("Query class is not a valid type; how did you get here?")
		}
	}
	
	/**
	 * Executes the query and sets up the handlers to display the results
	 * @expose
	 */
	me.submitQuery = function() {
		saveSource();
		saveHistory();
		let request = queryModuleService.runQuery(me.query, me.type, me.limitResults, me.queryClass, me.applicationName)
		if (request) {
			clearState()
			$scope.submitting = true;
			request.then(function(results) {
				$scope.submitting = false;
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
						$log.debug("Result columns: ", columns)

						if (columns) {
							me.columnNames = columns
							me.host = results["host"]
							me.data = data
							
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
							
							me.cols = ngTableColumns
							
							$scope.tableParams = 
								new NgTableParams(
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
							me.infoBanner = "Unable to extract column names from data set?"
						}
					} else {
						me.infoBanner = "No results found matching this query."
					}
				} else {
					me.infoBanner = "No results found matching this query."
				}
				$scope.resultselem.open = true
			}, commonErrorHandlerFunction)
		}
	}

	$scope.applications = []
	
	$scope.numbersOnlyRegex = /\d+/
	$scope.resultselem = {}
	$scope.historyelem = {}
	
	$scope.$watch("ctrl.query", function(newVal, oldValue) {
		saveSource()
	});

	$scope.$watch("ctrl.type", function(newVal, oldValue) {
		if (newVal === "XMLFilter") {
			$scope.codeMirror.setOption("mode", "application/xml");
		} else {
			$scope.codeMirror.setOption("mode", "text/x-sql")
		}
	})
	
	$scope.editorOptions = {
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

	$scope.onCodeMirrorLoad = function(cm) {
		$log.debug("CodeMirror loaded ", cm)
		$scope.codeMirror = cm;
	}

	queryModuleService.getConfiguration().then((config) => {
		$scope.applications = config.applications ?? []
	})

}

queryModule.controller('QueryModuleController',
	['queryModuleService', '$window', '$timeout', '$q', '$scope', '$uibModal', '$interpolate', '$log', 'NgTableParams', QueryModuleController]);


/**
 * Services that handles functionality around the page configuration.
 */
queryModule.service('queryModuleService', ['$http', '$log', function($http, $log) {

	return {
		loadFilter: function(type, name) {
			if (name && type) {
				let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/filter/load');
				let config = {
					params: {
						type: type,
						name: name
					}
				}
				// TODO: Handle error output here
				return $http.get(PAGE_CONFIG_URL, config).then(
					// Success
					function(response) {
						$log.debug(response.data)
						return response.data;
					}
				);
			} else {
				throw "Name and type are required"
			}
		},
		loadFilterOptions: function(type) {
			if (type) {
				let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/filter/load');
				let config = {
					params: {
						type: type,
						options: true
					}
				}
				// TODO: Handle error output here
				return $http.get(PAGE_CONFIG_URL, config).then(
					// Success
					function (response) {
						$log.debug(response.data)
						return response.data;
					}
				);
			}
		},
		translateFilter: function(query, queryClass) {
			if (query && queryClass) {
				let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/filter/translate');
				let config = {
					params: {
						queryClass: queryClass,
						query: query
					}
				}
				// TODO: Handle error output here
				return $http.get(PAGE_CONFIG_URL, config).then(
					// Success
					function(response) {
						$log.debug(response.data)
						return response.data;
					}
				);
			}
		},
		translateHql: function(query) {
			if (query) {
				let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/hql/translate');
				let config = {
					params: {
						query: query
					}
				}
				// TODO: Handle error output here
				return $http.get(PAGE_CONFIG_URL, config).then(
					// Success
					function(response) {
						$log.debug(response.data)
						return response.data;
					}
				);
			}
		},
		getConfiguration: function() {
			let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/configuration');
			return $http.get(PAGE_CONFIG_URL).then(
				// Success
				function(response) {
					$log.debug(response.data)
					return response.data;
				}
			);
		},
		/**
		 * Retrieves the history from the plugin service
		 * @returns History data in obj["history"] or an error in obj["error"]
		 */
		runQuery: function(query, type, limitResults, queryClass, application) {
			if (query) {
				let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/query?limit=' + limitResults);

				let data = {
					query: query,
					type: type,
					queryClass: queryClass,
					application: (application || "")
				}
				
				// TODO: Handle error output here
				return $http.post(PAGE_CONFIG_URL, data).then(
					// Success
					function(response) {
						$log.debug(response.data)
						return response.data;
					}
				);
			}
		}

	};

}]);

/**
 * @ngInject
 * @param $scope
 * @param $uibModalInstance
 * @param state
 * @constructor
 */
function LoadObjectModalController($scope, $uibModalInstance, state) {
	$scope.availableTypes = state.availableTypes;
	$scope.availableNames = [];
	$scope.selectedName = "";
	$scope.selectedType = "";

	$scope.$watch(
		function() {
			return $scope.selectedType
		},
		function(newVal, oldVal) {
			if (newVal !== undefined && newVal !== "") {
				$scope.selectedName = "";
				state.loadNames(newVal).then(function (names) {
					$scope.availableNames = names;
				})
			}
		}
	)

	$scope.ok = function () {
		$uibModalInstance.close({
			selectedType: $scope.selectedType,
			selectedName: $scope.selectedName
		});
	};

	$scope.cancel = function() {
		$uibModalInstance.dismiss('cancel');
	}
}

queryModule.controller('LoadObjectModalController',
	['$scope', '$uibModalInstance', 'state', LoadObjectModalController])