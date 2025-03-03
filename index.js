import express from 'express';
import { EndedAuctionManager } from './AuctionData/EndedAuctionManager.js';
import { CurrentAuctionManager } from './AuctionData/CurrentAuctionManager.js';
import { SanitizedAuctionManager } from './AuctionData/SanitizedAuctionManager.js';

const app = express();
const port = process.env.PORT || 3000;

let endedManager, currentManager, auctionManager;

(async () => {
    try {
        console.log('Initializing ended auctions manager...');
        endedManager = new EndedAuctionManager();
        await endedManager.processEndedAuctions();
        console.log('Ended auctions processed.');

        console.log('Initializing current auctions manager...');
        currentManager = new CurrentAuctionManager(endedManager);
        await currentManager.updateAuctionCache();
        console.log('Current auctions processed.');

        auctionManager = new SanitizedAuctionManager(endedManager, currentManager);

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Error during initialization:', error);
    }
})();

/**
 * GET /auctions/items
 * Returns auctions for all items.
 */
app.get('/auctions/items', (req, res) => {
    // Assuming currentManager.rawStorage.dataByItem holds all items grouped by itemName.
    const allItems = currentManager.rawStorage.dataByItem;
    if (!allItems) {
        return res.status(404).json({ error: 'No item auctions found' });
    }
    res.json(allItems);
});


/**
 * GET /auctions/items/:itemName
 * Query parameters: attributes
 * Returns auctions for a specific item along with its average price.
 */
app.get('/auctions/items/:itemName', (req, res) => {
    const { itemName } = req.params;
    const result = auctionManager.getSanitizedAuctions(itemName, req.query);
    if (!result) {
        return res.status(404).json({ error: `No current auctions found for ${itemName}` });
    }
    res.json(result);
});

/**
 * GET /auctions/pets
 * Query parameters: rarity, name, level, candied
 * Returns pet auctions with optional filters.
 */
app.get('/auctions/pets', (req, res) => {
    const result = auctionManager.getSanitizedPetAuctions({
        rarity: req.query.rarity,
        name: req.query.name,
        level: req.query.level,
        candied: req.query.candied,
    });
    if (!result) {
        return res.status(404).json({ error: 'No pet auctions found for that search' });
    }
    res.json(result);
});

/**
 * GET /auctions/averages
 * Returns overall average prices from ended auctions.
 */
app.get('/auctions/averages', (req, res) => {
    if (!endedManager || typeof endedManager.getAllAverages !== 'function') {
        return res.status(501).json({ error: 'Endpoint not implemented' });
    }
    const averages = endedManager.getAllAverages();
    res.json(averages);
});

/**
 * GET /auctions/averages/:itemName
 * Returns the average price for a specific item.
 */
app.get('/auctions/averages/:itemName', (req, res) => {
    const { itemName } = req.params;
    const overallAvg = endedManager.computeAvgPrice(itemName);
    if (overallAvg === null || overallAvg === undefined) {
        return res.status(404).json({ error: `No average found for ${itemName}` });
    }
    res.json({ item: itemName, overallAvg });
});

/**
 * GET /auctions/lowestbin
 * Returns the lowest BIN auction for each item.
 */
app.get('/auctions/lowestbin', (req, res) => {
    const lowestBins = currentManager.getAllLowestBinPrices();
    if (!lowestBins || Object.keys(lowestBins).length === 0) {
        return res.status(404).json({ error: 'No lowest BIN auctions found' });
    }
    res.json(lowestBins);
});

/**
 * GET /auctions/median/:itemName
 * Returns q1, median, and iqr for the given item.
 */
app.get('/auctions/median/:itemName', (req, res) => {
    const { itemName } = req.params;
    const stats = endedManager.computeStats(itemName);
    if (!stats || stats.median === null) {
        return res.status(404).json({ error: `No median stats found for ${itemName}` });
    }
    res.json({ item: itemName, stats: [stats.q1, stats.median, stats.iqr] });
});

/**
 * GET /auctions/attribute/:attribute
 * Query parameters: level, onwards, piece, shard
 * Returns auctions filtered by the given attribute and level.
 */
app.get('/auctions/attribute/:attribute', (req, res) => {
    const { attribute } = req.params;
    const { level, onwards, piece, shard } = req.query;
    if (!level) {
        return res.status(400).json({ error: 'Query parameter "level" is required' });
    }
    const onwardsFlag = (onwards === 'true' || onwards === true);
    const results = auctionManager.getAuctionsByAttribute(attribute, level, piece, onwardsFlag, shard);
    if (!results || Object.keys(results).length === 0) {
        return res.status(404).json({ error: 'No auctions found for that attribute and level' });
    }
    res.json(results);
});
