import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { CronJob } from 'cron';
import { AuctionManagerBase } from './AuctionManagerBase.js';
import { RawAuctionStorage } from './RawAuctionStorage.js';
import { sendRelayMessage } from '../helpers/discordWebhook.js';
import { formatNumber } from '../helpers/numberFormatters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CurrentAuctionManager extends AuctionManagerBase {
    /**
     * @param {EndedAuctionManager} endedManager
     */
    constructor(endedManager) {
        super();
        this.endedManager = endedManager;
        this.rawStorage = new RawAuctionStorage();
        this.auctionCache = [];
        this.lastUpdate = null;
        this.previousLowestBinPrices = null;

        this.firstTime = true;

        // Number of threads to use for concurrent processing.
        this.threads = 5;

        this.job = new CronJob('0 * * * * *', () => {
            this.updateAuctionCache();
        });

        this.job.start();
    }

    async fetchCurrentAuctions(page = 1) {
        const url = `https://api.hypixel.net/v2/skyblock/auctions?page=${page}`;
        return this.fetchAuctions(url);
    }

    async processCurrentAuctions() {
        // Process current auctions from page 1 (if needed separately)
        const data = await this.fetchCurrentAuctions(1);
        if (!data || !data.auctions) return;

        for (const auction of data.auctions) {
            const parsed = await this.parseAuction(auction);
            if (!parsed) continue;

            this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey, { limited: false });
        }
    }

    runWorker(workerPayload) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(
                path.join(__dirname, '../helpers/processPageWorker.js'),
                {
                    workerData: workerPayload
                }
            );
            worker.on('message', (result) => resolve(result));
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    async updateAuctionCache() {
        try {
            console.time("updateAuctionCache");
            const lastBaseline = this.previousLowestBinPrices;
            this.rawStorage.dataByItem = {};
            this.auctionCache = [];
    
            if (!this.notifiedFlips) this.notifiedFlips = new Set();
    
            console.time("fetchPage1");
            // Process page 1 and get total pages.
            const firstPageData = await this.fetchCurrentAuctions(1);
            console.timeEnd("fetchPage1");
    
            if (!firstPageData || !firstPageData.auctions) return;
    
            let aggregatedAuctions = [];
            const minimumDifference = 25_000_000;
    
            if (lastBaseline && !this.firstTime) {
                console.log("Checking for real-time flips...");
            } else if (this.firstTime) {
                console.log("First time update, skipping real-time flip checks.");
                this.firstTime = false;
            }
    
            // Process page 1 auctions concurrently.
            console.time("processPage1");
            for (const auction of firstPageData.auctions) {
                const parsed = await this.parseAuction(auction);
                if (!parsed) continue;
            
                this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey, { limited: false });
                aggregatedAuctions.push(parsed);
            

                const { median, iqr, q1 } = this.endedManager.computeStats(parsed.itemName);
                if (q1) {
                    if (
                        parsed.auctionRecord.price < q1 &&
                        (q1 - parsed.auctionRecord.price) >= minimumDifference && 
                        !this.notifiedFlips.has(parsed.auctionRecord.uuid)
                    ) {
                        sendRelayMessage(this.getFlipEmbed(parsed, q1, median, iqr));
                        this.notifiedFlips.add(parsed.auctionRecord.uuid);
                    }
                };
            }

            console.timeEnd("processPage1");
    
            const totalPages = firstPageData.totalPages - 1 || 1;
            const limit = pLimit(this.threads); // Limit concurrency for worker tasks.
            const workerPromises = [];
    
            console.time("workerPages");
            // Dispatch worker tasks for pages 2 through totalPages.
            for (let page = 2; page <= totalPages; page++) {
                workerPromises.push(
                    limit(async () => {
                        const pageData = await this.fetchCurrentAuctions(page);
                        if (pageData) {
                            const avgPriceData = this.endedManager.getAllAverages();
                            return this.runWorker({ pageData, avgPriceData });
                        }
                        return [];
                    })
                );
            }
    
            const workerResultsArrays = await Promise.all(workerPromises);
            workerResultsArrays.forEach(resultsArray => {
                aggregatedAuctions = aggregatedAuctions.concat(resultsArray);
                resultsArray.forEach(parsed => {
                    this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey, { limited: false });

                    const { median, iqr, q1 } = this.endedManager.computeStats(parsed.itemName);
                    if (q1) {
                        if (
                            parsed.auctionRecord.price < q1 &&
                            (q1 - parsed.auctionRecord.price) >= minimumDifference && 
                            !this.notifiedFlips.has(parsed.auctionRecord.uuid)
                        ) {
                            sendRelayMessage(this.getFlipEmbed(parsed, q1, median, iqr));
                            this.notifiedFlips.add(parsed.auctionRecord.uuid);
                        }
                    };
                });
            });
            console.timeEnd("workerPages");
    
            this.auctionCache = aggregatedAuctions;
            this.lastUpdate = new Date();
            console.log(`Current auction cache updated at ${this.lastUpdate} with ${aggregatedAuctions.length} auctions.`);
    
            console.time("updateBaseline");
            const newBaseline = this.getAllLowestBinPrices();
            this.previousLowestBinPrices = newBaseline;
            console.timeEnd("updateBaseline");
    
            console.timeEnd("updateAuctionCache");
        } catch (error) {
            console.error("Error updating current auction cache:", error);
        }
    }
    

    /**
     * Computes the lowest BIN price for an item.
     * For bucketed auctions (stored by attrKey), sorts each bucket by price and returns the lowest price.
     * For a flat array of auctions, returns the lowest price from the default bucket.
     *
     * @param {string} itemName
     * @returns {Object|null} An object mapping each bucket (or "default") to the lowest BIN price,
     */
    computeBucketLowestPrice(itemName) {
        const auctions = this.rawStorage.getAuctions(itemName);
        if (!auctions) return null;
    
        const bucketLowest = {};
    
        // Helper function to extract price from an auction.
        const getPrice = (a) => a.auctionRecord && a.auctionRecord.price ? a.auctionRecord.price : a.price;
    
        // If auctions are stored by bucket (object)...
        if (!Array.isArray(auctions)) {
            for (const bucketKey in auctions) {
                const bucket = auctions[bucketKey];
                if (bucket.length > 0) {
                    let minPrice = Infinity;
                    for (let i = 0; i < bucket.length; i++) {
                        const price = getPrice(bucket[i]);
                        if (price < minPrice) {
                            minPrice = price;
                        }
                    }
                    bucketLowest[bucketKey] = minPrice === Infinity ? 0 : minPrice;
                } else {
                    bucketLowest[bucketKey] = 0;
                }
            }
        } else {
            // Flat array of auctions; use a default key.
            if (auctions.length > 0) {
                let minPrice = Infinity;
                for (let i = 0; i < auctions.length; i++) {
                    const price = getPrice(auctions[i]);
                    if (price < minPrice) {
                        minPrice = price;
                    }
                }
                bucketLowest['default'] = minPrice === Infinity ? 0 : minPrice;
            } else {
                bucketLowest['default'] = 0;
            }
        }
        return bucketLowest;
    }
    
    /**
     * Returns an object mapping each item name to its lowest BIN price.
     * If an item is stored with buckets and only one bucket exists (named "default"),
     * the value is a number; otherwise, it's an object mapping each bucket to its lowest price.
     *
     * @returns {Object} An object mapping item names to their lowest BIN price(s)
     */
    getAllLowestBinPrices() {
        const lowest = {};
        for (const itemName in this.rawStorage.dataByItem) {
            const bucketLowest = this.computeBucketLowestPrice(itemName);

            // If the item has a lowest price, add it to the result object.
            if (bucketLowest !== null) {
                const keys = Object.keys(bucketLowest);
                if (keys.length === 1 && keys[0] === "default") {
                    lowest[itemName] = bucketLowest["default"];
                } else {
                    lowest[itemName] = bucketLowest;
                }
            }
        }
        return lowest;
    }

    getFlipEmbed(auction, benchmark, median, iqr) {
        return {
            title: `Real-time flip detected for ${auction.itemName}`,
            description: `Auction price ${formatNumber(auction.auctionRecord.price)} vs. benchmark ${formatNumber(benchmark)}`,
            color: 0xA020F0,
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: "Profit",
                    value: `${formatNumber(benchmark - auction.auctionRecord.price)}`,
                },
                {
                    name: "Median Price",
                    value: `${formatNumber(median)}`,
                    inline: true
                },
                {
                    name: "IQR",
                    value: `${formatNumber(iqr)}`,
                    inline: true
                },
                {
                    name: "View Auction",
                    value: `\`/viewauction ${auction.auctionRecord.uuid}\``
                }
            ],
        };
    }
}
