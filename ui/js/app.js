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
	return (input, defaultValue) => {
		if (angular.isUndefined(input) || input === null || input === '') {
			return defaultValue;
		}

		return input;
	}
});

queryModule.filter('reverse', function() {
	return (items) => {
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
    return (content, length, tail) => {
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
 * @ngInject
 * @param $scope
 * @param $uibModalInstance
 * @param state
 * @constructor
 */
class LoadObjectModalController {
	constructor($scope, $uibModalInstance, state) {
		$scope.availableTypes = state.availableTypes;
		$scope.availableNames = [];
		$scope.selectedName = "";
		$scope.selectedType = "";

		$scope.$watch(
			() => {
				return $scope.selectedType
			},
			(newVal, oldVal) => {
				if (newVal !== undefined && newVal !== "") {
					$scope.selectedName = "";
					state.loadNames(newVal).then(function (names) {
						$scope.availableNames = names;
					})
				}
			}
		)

		$scope.ok = () => {
			$uibModalInstance.close({
				selectedType: $scope.selectedType,
				selectedName: $scope.selectedName
			});
		};

		$scope.cancel = () => {
			$uibModalInstance.dismiss('cancel');
		}
	}
}

queryModule.controller('LoadObjectModalController',
	['$scope', '$uibModalInstance', 'state', LoadObjectModalController])