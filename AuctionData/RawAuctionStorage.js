export class RawAuctionStorage {
    constructor() {
        this.dataByItem = {};
    }

    /**
     * @param {string} itemName - The name of the item.
     * @param {Object} auction - The auction record.
     * @param {string} [attrKey] - Optional attribute key for bucketed storage.
     * @param {Object} [options] - Options object.
     * @param {boolean} [options.limited=true] - Whether to limit the bucket to 15 entries.
     */
    addAuction(itemName, auction, attrKey, options = { limited: true }) {
        if (attrKey === undefined) {
            attrKey = "default";
        }
        if (!this.dataByItem[itemName]) {
            this.dataByItem[itemName] = {};
        }
        if (!this.dataByItem[itemName][attrKey]) {
            this.dataByItem[itemName][attrKey] = [];
        }
        this.dataByItem[itemName][attrKey].push(auction);
        if (options.limited && this.dataByItem[itemName][attrKey].length > 15) {
            this.dataByItem[itemName][attrKey].shift();
        }
    }

    getAuctions(itemName) {
        return this.dataByItem[itemName] || null;
    }
}