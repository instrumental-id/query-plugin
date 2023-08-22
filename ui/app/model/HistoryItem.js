class HistoryItem {
    /**
     * @param {string|Object} thing
     */
    constructor(thing) {
        if (angular.isString(thing)) {
            thing = JSON.parse(thing)
        }

        if (thing === undefined || thing === null || !angular.isObject(thing)) {
            throw "Illegal history input (must be string or object)"
        }

        this.date = thing.date ?? new Date().toISOString()

        /**
         * Query saved in this history item
         * @type {string|null}
         */
        this.query = thing.query ?? null

        /**
         * Query saved in this history item
         * @type {string|null}
         */
        this.type = thing.type ?? null
    }

    /**
     * @param {!any} other The other thing to compare
     * @return {boolean} True if the other object represents the same entry as this one
     */
    matches(other) {
        if (other === undefined || other === null || !angular.isObject(other)) {
            return false
        }

        let otherQuery = other.query ?? ""
        let otherType = other.type ?? ""

        return (this.query === otherQuery && this.type === otherType)
    }

    toJSON() {
        let obj = {
            query: this.query,
            type: this.type
        }

        return JSON.stringify(obj)
    }
}