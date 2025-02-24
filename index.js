import express from 'express';
import {
    EndedAuctionManager
} from './AuctionData/EndedAuctionManager.js';
import {
    CurrentAuctionManager
} from './AuctionData/CurrentAuctionManager.js';
import {
    SanitizedAuctionManager
} from './AuctionData/SanitizedAuctionManager.js';

const app = express();
const port = process.env.PORT || 3000;

let endedManager, currentManager, auctionManager;

// I accidently beutified the code, so it looks very bad. I'm sorry.
// I will fix it
// I will fix it x2
// I will fix it x3
// I will fix it x4

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

// Routes remain the same.
// GET /auctions/current/ENDERMAN?pet=true&rarity=LEGENDARY&level=80&candied=false
app.get('/auctions/current/:itemName', (req, res) => {
    const {
        itemName
    } = req.params;

    if (itemName === 'PETS') {
        console.log('Searching for pet auctions...');
        const result = auctionManager.getSanitizedPetAuctions({
            rarity: req.query.rarity,
            name: req.query.name, // Use 'name' to filter pet type
            level: req.query.level, // optional; defaults to 80 in our method
            candied: req.query.candied
        });
        if (!result) {
            return res.status(404).json({
                error: 'No pet auctions found for that search'
            });
        }
        return res.json(result);
    }

    // Otherwise, use the normal auction search.
    const result = auctionManager.getSanitizedAuctions(itemName, req.query);
    if (!result) {
        return res.status(404).json({
            error: 'No current auctions found for that item'
        });
    }
    res.json(result);
});


app.get('/auctions/raw', (req, res) => {
    if (!currentManager) {
        return res.status(503).json({
            error: 'Current manager not initialized'
        });
    }
    const result = currentManager.rawStorage;
    if (!result) {
        return res.status(404).json({
            error: 'No current auctions found'
        });
    }
    res.json(result);
});

app.get('/auctions/averages', (req, res) => {
    if (!endedManager || typeof endedManager.getAllAverages !== 'function') {
        return res.status(501).json({
            error: 'Endpoint not implemented'
        });
    }
    const averages = endedManager.getAllAverages();
    res.json(averages);
});

app.get('/auctions/attribute/:attribute', (req, res) => {
    if (!auctionManager) {
        return res.status(503).json({
            error: 'Auction manager not initialized'
        });
    }
    const {
        attribute
    } = req.params;
    const {
        level,
        onwards
    } = req.query;
    if (!level) {
        return res.status(400).json({
            error: 'Query parameter "level" is required'
        });
    }
    const onwardsFlag = (onwards === 'true' || onwards === true);

    const results = auctionManager.getAuctionsByAttribute(attribute, level, onwardsFlag);
    if (!results || Object.keys(results).length === 0) {
        return res.status(404).json({
            error: 'No auctions found for that attribute and level'
        });
    }
    res.json(results);
});

// GET /auctions/pets
app.get('/auctions/pets', (req, res) => {
    if (!currentManager || !currentManager.rawStorage) {
        return res.status(503).json({
            error: 'Current manager not initialized'
        });
    }
    const petsAuctions = currentManager.rawStorage.getAuctions("PETS");
    if (!petsAuctions) {
        return res.status(404).json({
            error: 'No pet auctions found'
        });
    }
    res.json(petsAuctions);
});