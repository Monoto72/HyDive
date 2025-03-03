import { CronJob } from 'cron';
import { AuctionManagerBase } from './AuctionManagerBase.js';
import { RawAuctionStorage } from './RawAuctionStorage.js';

export class EndedAuctionManager extends AuctionManagerBase {
    constructor() {
        super();
        this.rawStorage = new RawAuctionStorage();

        this.job = new CronJob('0 * * * * *', () => {
            this.processEndedAuctions();
        });

        this.job.start();
    }

    async fetchEndedAuctions() {
        const url = `https://api.hypixel.net/v2/skyblock/auctions_ended`;
        return this.fetchAuctions(url);
    }

    async processEndedAuctions() {
        const data = await this.fetchEndedAuctions();
        if (!data || !data.auctions) return;

        for (const auction of data.auctions) {
            const parsed = await this.parseAuction(auction);
            if (!parsed) continue;

            this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey);
        }
        console.log('Processed ended auctions.');
    }

    // Does what bucketAverages does, but for bigger data sets.
    computeAvgPrice(itemName) {
        const auctions = this.rawStorage.getAuctions(itemName);
        if (!auctions) return null;

        // Bucket keys are Atrr
        if (!Array.isArray(auctions)) {
            let total = 0,
                count = 0;
            Object.values(auctions).forEach(bucket => {
                bucket.forEach(a => {
                    total += a.auctionRecord.price;
                    count++;
                });
            });
            return count > 0 ? total / count : null;
        }

        // Simple array of auctions.
        const total = auctions.reduce((sum, a) => sum + a.price, 0);
        return total / auctions.length;
    }

    // Grabs specific buckets for a given item and computes the average. Realistically, you should wait for 15 entries to rely on.
    computeBucketAverages(itemName) {
        const auctions = this.rawStorage.getAuctions(itemName);
        if (!auctions) return null;

        const bucketAverages = {};
        if (!Array.isArray(auctions)) {
            // Auctions are stored by bucket (attrKey).
            for (const bucketKey in auctions) {
                const bucket = auctions[bucketKey];
                const total = bucket.reduce((sum, a) => sum + a.auctionRecord.price, 0);
                bucketAverages[bucketKey] = bucket.length > 0 ? total / bucket.length : 0;
            }
        } else {
            // Single bucket case; we use a default key.
            const total = auctions.reduce((sum, a) => sum + a.price, 0);
            bucketAverages['default'] = auctions.length > 0 ? total / auctions.length : 0;
        }
        return bucketAverages;
    }

    // Returns an object with per-bucket average prices for each item.
    getAllAverages() {
        const averages = {};
        for (const itemName in this.rawStorage.dataByItem) {
            const bucketAverages = this.computeBucketAverages(itemName);
            if (bucketAverages !== null) {
                const keys = Object.keys(bucketAverages);
                if (keys.length === 1 && keys[0] === "default") {
                    averages[itemName] = bucketAverages["default"];
                } else {
                    averages[itemName] = bucketAverages;
                }
            }
        }
        return averages;
    }
    
    quickSelect(arr, k) {
        if (arr.length === 1) {
            return arr[0];
        }
        const pivot = arr[Math.floor(Math.random() * arr.length)];
        const lows = arr.filter(el => el < pivot);
        const highs = arr.filter(el => el > pivot);
        const pivots = arr.filter(el => el === pivot);

        if (k < lows.length) {
            return this.quickSelect(lows, k);
        } else if (k < lows.length + pivots.length) {
            return pivot; // k is within the range of pivot values
        } else {
            return this.quickSelect(highs, k - lows.length - pivots.length);
        }
    }

    computeQuantile(arr, quantile) {
        const n = arr.length;
        const pos = (n - 1) * quantile;
        const base = Math.floor(pos);
        const rest = pos - base;
        const lower = this.quickSelect(arr.slice(), base);
        if (rest === 0) {
            return lower;
        }
        const upper = this.quickSelect(arr.slice(), base + 1);
        return lower + rest * (upper - lower);
    }

    computeStats(itemName, minResults = 5) {
        const auctions = this.rawStorage.getAuctions(itemName);
        if (!auctions) return { median: null, iqr: null, q1: null };

        let prices = [];
        if (!Array.isArray(auctions)) {
            for (const bucket of Object.values(auctions)) {
                for (const a of bucket) {
                    if (a.auctionRecord && a.auctionRecord.price) {
                        prices.push(a.auctionRecord.price);
                    } else if (a.price) {
                        prices.push(a.price);
                    }
                }
            }
        } else {
            prices = auctions.map(a => (a.auctionRecord && a.auctionRecord.price) ? a.auctionRecord.price : a.price);
        }
        
        if (prices.length < minResults) return { median: null, iqr: null, q1: null };

        const median = this.computeQuantile(prices, 0.5);
        const q1 = this.computeQuantile(prices, 0.25);
        const q3 = this.computeQuantile(prices, 0.75);
        const iqr = q3 - q1;
        return { median, iqr, q1 };
    }

}
