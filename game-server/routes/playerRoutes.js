const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Player = require('../models/player'); // Import the Player model
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const { relocateOnePlayerHome } = require('../utils/relocatePlayersHome');
const queue = require('../queue'); // Import the in-memory queue
const sendMailboxMessage = require('../utils/messageUtils');
 

///////// QUEST ROUTES ////////////

// GET /api/quests
router.get('/quests', (req, res) => {
  try {
    const questsPath = path.join(__dirname, '../tuning/quests/questsEN.json');
    const questsData = JSON.parse(fs.readFileSync(questsPath, 'utf-8'));
    res.json(questsData);
  } catch (error) {
    console.error('Error reading quests.json:', error);
    res.status(500).json({ error: 'Failed to load quests.' });
  }
});

// Endpoint to add a quest to a player's active quests
router.post('/add-player-quest', async (req, res) => {
  const { playerId, questId, startTime, progress } = req.body;

  if (!playerId || !questId || !startTime) {
    return res.status(400).json({ error: 'Player ID, quest ID, and start time are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    if (!Array.isArray(player.activeQuests)) {
      player.activeQuests = [];
    }

    const isQuestActive = player.activeQuests.some((quest) => quest.questId === questId);
    if (isQuestActive) {
      return res.status(400).json({ error: 'Quest is already active.' });
    }

    // Load quest details from quests.json
    const questsPath = path.join(__dirname, '../tuning/quests/questsEN.json');
    const questsData = JSON.parse(fs.readFileSync(questsPath, 'utf-8'));
    const questDetails = questsData.find((q) => q.title === questId);

    if (!questDetails) {
      return res.status(404).json({ error: 'Quest details not found in quests.json.' });
    }

    // Default progress setup (if none provided)
    let initialProgress = progress || { goal1: 0, goal2: 0, goal3: 0 };

    // Check if all goals are met at the time of quest addition
    let totalGoals = 0;
    let completedGoals = 0;

    for (let i = 1; i <= 3; i++) {
      const goalAction = questDetails[`goal${i}action`];
      const goalItem = questDetails[`goal${i}item`];
      const goalQty = questDetails[`goal${i}qty`];

      if (!goalAction || !goalItem || !goalQty) continue; // Skip undefined goals
      totalGoals++;

      // Ensure the goal exists in progress
      if (typeof initialProgress[`goal${i}`] !== 'number') {
        initialProgress[`goal${i}`] = 0;
      }

      if (initialProgress[`goal${i}`] >= goalQty) {
        completedGoals++;
      }
    }

    const isQuestCompleted = totalGoals > 0 && completedGoals === totalGoals;

    // Add the full quest details to activeQuests
    player.activeQuests.push({
      questId,
      startTime,
      progress: initialProgress, // Use provided progress or default to 0
      completed: isQuestCompleted, // Mark as completed if all goals met
      rewardCollected: false,
      ...questDetails, // Include goal actions, items, and quantities
    });

    await player.save();

    console.log(`✅ Quest "${questId}" added to player "${playerId}" with progress:`, initialProgress);

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error adding quest to player:', error);
    res.status(500).json({ error: 'Failed to add quest to player.' });
  }
});

router.post('/clear-quest-history', async (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Clear both activeQuests and completedQuests
    player.activeQuests = [];
    player.completedQuests = [];
    await player.save();

    console.log(`Quest history (active and completed) cleared for player: ${playerId}`);
    res.status(200).json({ success: true, player });
  } catch (error) {
    console.error('Error clearing quest history:', error);
    res.status(500).json({ error: 'Failed to clear quest history.' });
  }
});

router.post('/complete-quest', async (req, res) => {
  const { playerId, questId, reward } = req.body;

  console.log('hitting complete-quest');
  console.log('req.body = ', req.body);

  if (!playerId || !questId || !reward) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const questIndex = player.activeQuests.findIndex((q) => q.questId === questId);

    if (questIndex === -1 || !player.activeQuests[questIndex].completed) {
      return res.status(400).json({ error: 'Quest is not marked as completed.' });
    }

    // Add the reward to inventory
    const inventory = player.inventory || [];
    const itemIndex = inventory.findIndex((item) => item.type === reward.type);
    if (itemIndex >= 0) {
      inventory[itemIndex].quantity += reward.quantity;
    } else {
      inventory.push({ type: reward.type, quantity: reward.quantity });
    }

    // Move the quest to completedQuests and remove extra details
    const completedQuest = {
      questId,
      timestamp: Date.now(),
      completed: true,
    };
    player.completedQuests = player.completedQuests || [];
    player.completedQuests.push(completedQuest);

    // Remove the quest from activeQuests
    player.activeQuests.splice(questIndex, 1);

    player.inventory = inventory;
    await player.save();

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error completing quest:', error);
    res.status(500).json({ error: 'Failed to complete quest.' });
  }
});

router.post('/update-player-quests', async (req, res) => {
  const { playerId, activeQuests } = req.body;

  console.log('/update-player-quests: playerId: ',playerId,' activeQuests: ',activeQuests);

  if (!playerId || !Array.isArray(activeQuests)) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Update the player's active quests
    player.activeQuests = activeQuests;
    console.log('player.activeQuests before save: ',player.activeQuests);
    await player.save();

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error updating player quests:', error);
    res.status(500).json({ error: 'Failed to update player quests.' });
  }
});



///////// CORE PLAYER ROUTES ////////////

// ✅ Get player by ID
router.get('/player/:playerId', async (req, res) => {
  const { playerId } = req.params;

  console.log(`Fetching player with ID: ${playerId}`);

  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json(player); // Return the full player object
  } catch (error) {
    console.error('Error fetching player data:', error);
    res.status(500).json({ error: 'Failed to fetch player data.' });
  }
});

// ✅ Get player by username
router.get('/get-player-by-username/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json(player); // Return full player object
  } catch (error) {
    console.error('Error fetching player by username:', error);
    res.status(500).json({ error: 'Failed to fetch player.' });
  }
});

// Endpoint to update the player's profile
router.post('/update-profile', async (req, res) => {
  const { playerId, updates } = req.body;

  try {
    // ✅ Check if the username is already taken (excluding the current player)
    if (updates.username) {
      const existingPlayer = await Player.findOne({ username: updates.username });
      if (existingPlayer && existingPlayer._id.toString() !== playerId) {
        return res.status(400).json({ error: "TAKEN" });
      }
    }
        
    // ✅ Proceed with the update if no conflicts
    const player = await Player.findByIdAndUpdate(playerId, { $set: updates }, { new: true });
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json({ success: true, player });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

router.post('/update-settings', async (req, res) => {
  const { playerId, settings } = req.body;

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }

    // Update player settings
    player.settings = { ...settings };
    await player.save();

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error updating player settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings.' });
  }
});

// ✅ Get all players in a given settlement
router.get('/get-players-by-settlement/:settlementId', async (req, res) => {
  try {
    const { settlementId } = req.params;
    console.log(`📡 Fetching players for settlement: ${settlementId}`);

    const players = await Player.find(
      { settlementId },
      '_id username role netWorth tradeStall' // Added tradeStall to selected fields
    );

    if (!players || players.length === 0) {
      return res.json([]);
    }

    console.log(`✅ Found ${players.length} players with data:`, 
      players.map(p => ({
        id: p._id, 
        username: p.username, 
        netWorth: p.netWorth,
        tradeStall: p.tradeStall
      }))
    );
    
    res.json(players);
  } catch (error) {
    console.error("❌ Error fetching players by settlement:", error);
    res.status(500).json({ error: 'Server error while fetching players' });
  }
});




///////////// INVENTORY BASED ROUTES ////////////

// Endpoint to get the current player inventory or backpack
router.get('/inventory/:playerId', async (req, res) => {
  const { playerId } = req.params;
  console.log(`GET /api/inventory/:playerId - Fetching inventory and backpack for playerId: ${playerId}`);
 
  // Validate the ObjectId format
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    console.error(`Invalid ObjectId format: ${playerId}`);
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }

  try {
    const player = await Player.findById(playerId); // Use findById for playerId
    if (player) {
      res.json({
        inventory: player.inventory || [],
        backpack: player.backpack || [],
        warehouseCapacity: player.warehouseCapacity || 0,
        backpackCapacity: player.backpackCapacity || 0,
      });
    } else {
      res.status(404).json({ error: 'Player not found' });
    }
  } catch (error) {
    console.error('Error fetching inventory and backpack:', error);
    res.status(500).json({ error: 'Failed to fetch inventory and backpack' });
  }
});

// Endpoint to update the player inventory or backpack
router.post('/update-inventory', (req, res) => {
  const { playerId, inventory, backpack } = req.body;
  console.log(`POST /api/update-inventory - Updating inventory and/or backpack for playerId: ${playerId}`);
  console.log("👀 Incoming inventory:", inventory);
  console.log("👀 Incoming backpack:", backpack);

  // Enqueue the inventory update task using player-based key
  queue.enqueueByKey(playerId, async () => {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        console.error('Player not found.');
        res.status(404).json({ error: 'Player not found.' }); // Respond if player not found
        return;
      }
      if (inventory) player.inventory = inventory;
      if (backpack) player.backpack = backpack;

      await player.save();

      // Respond after processing
      res.json({
        success: true,
        player,
      });
    } catch (error) {
      console.error('Error updating inventory or backpack:', error);

      // Respond with an error if processing fails
      res.status(500).json({ error: 'Failed to update inventory or backpack.' });
    }
  });
});

// ✅ Delta-based inventory update (safer for concurrent actions)
router.post('/update-inventory-delta', (req, res) => {
  const { playerId, delta } = req.body;
  console.log(`POST /api/update-inventory-delta - Applying delta to playerId: ${playerId}`);
  console.log('Delta Payload:', delta);
  if (!playerId || !delta) {
    return res.status(400).json({ error: 'playerId and delta are required.' });
  }

  queue.enqueueByKey(playerId, async () => {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found.' });
      }
      const updates = Array.isArray(delta) ? delta : [delta];
      player.inventory = player.inventory || [];
      player.backpack = player.backpack || [];

      for (const change of updates) {
        const { type, quantity, target = 'inventory' } = change;
        if (!type || typeof quantity !== 'number') continue;

        const container = target === 'backpack' ? player.backpack : player.inventory;
        const existing = container.find(item => item.type === type);
        if (existing) {
          existing.quantity += quantity;
          if (existing.quantity <= 0) {
            const index = container.findIndex(i => i.type === type);
            container.splice(index, 1);
          }
        } else if (quantity > 0) {
          container.push({ type, quantity });
        }
      }

      await player.save();
      res.json({ success: true, player });
    } catch (error) {
      console.error('❌ Error in update-inventory-delta:', error);
      res.status(500).json({ error: 'Failed to apply inventory delta.' });
    }
  });
});


// Endpoint to update player capacities
router.post('/update-capacity', async (req, res) => {
  const { playerId, warehouseCapacity, backpackCapacity } = req.body;
  console.log(`POST /api/update-capacity - Updating capacities for playerId: ${playerId}`);

  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const updateFields = {};
    if (warehouseCapacity !== undefined) updateFields.warehouseCapacity = warehouseCapacity;
    if (backpackCapacity !== undefined) updateFields.backpackCapacity = backpackCapacity;

    const player = await Player.findByIdAndUpdate(
      playerId,
      { $set: updateFields },
      { new: true }
    );

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json({
      success: true,
      warehouseCapacity: player.warehouseCapacity,
      backpackCapacity: player.backpackCapacity,
      player, // Return the full updated player object if needed
    });
  } catch (error) {
    console.error('Error updating capacities:', error);
    res.status(500).json({ error: 'Failed to update capacities.' });
  }
});



////////// LOCATION BASED ROUTES ///////////

// Endpoint to get the current player position
router.get('/player-position/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ location: player.location });
  } catch (error) {
    console.error('Error fetching player position:', error);
    res.status(500).json({ error: 'Failed to fetch player position' });
  }
});

// Endpoint to update the player's position
router.post('/update-player-position', async (req, res) => {
  const { playerId, location } = req.body;

  if (!location) {
    return res.status(400).json({ error: 'Location data is required.' });
  }

  const { x, y, g, s, f, gtype } = location;
  console.log('Payload:', { x, y, g, s, f, gtype });

  if (!playerId || typeof x !== 'number' || typeof y !== 'number' || !g) {
    return res.status(400).json({ error: 'Invalid player coordinates or location data.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    player.location = location;
    await player.save();

    console.log('Player position successfully updated:', player.location);
    res.json({ success: true, player });
  } catch (error) {
    console.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position.' });
  }
});

// Endpoint to update the player's location in SettlementView
router.post('/update-player-location', async (req, res) => {
  const { playerId, location } = req.body;

  console.log(`POST /api/update-player-location - Updating location for playerId: ${playerId}`);
  console.log('Payload:', location);

  if (
    !playerId ||
    !location ||
    typeof location.x !== 'number' ||
    typeof location.y !== 'number' ||
    !location.g ||
    !location.s ||
    !location.f ||
    !location.gtype
  ) {
    return res.status(400).json({ error: 'Invalid location data. Ensure playerId and all location fields are provided.' });
  }

  try {
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { $set: { location } },
      { new: true }
    );

    if (!updatedPlayer) {
      return res.status(404).json({ error: 'Player not found' });
    }

    console.log('Player location successfully updated:', updatedPlayer.location);
    res.json({ success: true, player: updatedPlayer });
  } catch (error) {
    console.error('Error updating player location:', error);
    res.status(500).json({ error: 'Failed to update player location.' });
  }
});



////////////// SKILLS BASED ROUTES ///////////

// Endpoint to get the current player skills
router.get('/skills/:playerId', async (req, res) => {
  const { playerId } = req.params;
  console.log(`GET /api/skills/:playerId - Fetching skills for playerId: ${playerId}`);
 
  // Validate the ObjectId format
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    console.error(`Invalid ObjectId format: ${playerId}`);
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }

  try {
    const player = await Player.findById(playerId); // Use findById for playerId
    if (player) {
      res.json({
        skills: player.skills || [],
      });
    } else {
      res.status(404).json({ error: 'Player not found' });
    }
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

router.get('/skills-tuning', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../tuning/skillsTuning.json'); // Adjusted path
    const skillsTuning = JSON.parse(fs.readFileSync(filePath, 'utf8')); // Dynamically read the file
    res.json(skillsTuning);
  } catch (error) {
    console.error('Error loading skillsTuning.json:', error);
    res.status(500).json({ error: 'Failed to load skills tuning.' });
  }
});

// Endpoint to update player skills
router.post('/update-skills', async (req, res) => {
  const { playerId, skills } = req.body;
  console.log(`POST /api/update-skills - Updating skills for playerId: ${playerId}`);

  if (!playerId || !Array.isArray(skills)) {
    return res.status(400).json({ error: 'Player ID and a valid skills array are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    player.skills = skills; // Replace the skills array
    await player.save();

    res.json({
      success: true,
      player,
    });

    console.log('Skills updated successfully:', player.skills);
  } catch (error) {
    console.error('Error updating skills:', error);
    res.status(500).json({ error: 'Failed to update skills.' });
  }
});

router.post('/update-powers', async (req, res) => {
  const { playerId, powers } = req.body;
  if (!playerId || !Array.isArray(powers)) {
    return res.status(400).json({ error: 'Missing or invalid playerId or powers array.' });
  }
  try {
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { powers },
      { new: true }
    );
    if (!updatedPlayer) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    res.json({ message: 'Powers updated successfully.', powers: updatedPlayer.powers });
  } catch (err) {
    console.error('Error updating powers:', err);
    res.status(500).json({ error: 'Failed to update powers.' });
  }
});


////////////////////////////////////////////////////////
////////////// DELETE PLAYER ///////////////////////////

router.post('/delete-player', async (req, res) => {
  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const { gridId, settlementId } = player;

    // 1. Send other players in this grid home
    if (gridId) {
      const grid = await Grid.findOne({ gridId });
      if (grid && grid.playersInGrid) {
        const playersInGrid = grid.playersInGrid instanceof Map
          ? Array.from(grid.playersInGrid.keys())
          : Object.keys(grid.playersInGrid);
        for (const id of playersInGrid) {
          if (id !== playerId.toString()) {
            await relocateOnePlayerHome(id);
          }
        }
      }
    }

    // 2. Update Settlement grid reference and availability (search ALL settlements for the grid)
    if (gridId) {
      let fromSettlement = null;
      const settlements = await Settlement.find({});
      for (const settlement of settlements) {
        for (const row of settlement.grids) {
          for (const cell of row) {
            if (cell.gridId && String(cell.gridId) === String(gridId)) {
              cell.gridId = null;
              cell.available = true;
              fromSettlement = settlement;
            }
          }
        }
      }

      if (fromSettlement) {
        fromSettlement.markModified('grids');
        fromSettlement.population = Math.max((fromSettlement.population || 1) - 1, 0);
        await fromSettlement.save();
      }
    }

    // 3. Delete the Grid document
    if (gridId) {
      await Grid.deleteOne({ gridId });
    }

    // 4. Delete the player
    await Player.deleteOne({ _id: playerId });

    console.log(`✅ Player ${playerId} and associated grid ${gridId} deleted.`);
    res.json({ success: true });

  } catch (error) {
    console.error('❌ Error deleting player:', error);
    res.status(500).json({ error: 'Failed to delete player.' });
  }
});



////////////////////////////////////////////////////////
////////////// MESSAGE & STORE BASED ROUTES ///////////

// ✅ POST /api/send-mailbox-message
router.post('/send-mailbox-message', async (req, res) => {
  const { playerId, messageId, customRewards = [] } = req.body;

  if (!playerId || !messageId) { return res.status(400).json({ error: 'Missing playerId or messageId.' }); }

  // ✅ Sanitize rewards here (removes MongoDB subdocument _ids)
  const sanitizedRewards = customRewards.map(({ item, qty }) => ({
    item,
    qty
  }));

  try {
    const io = req.app.get('socketio'); // assuming io was attached in server.js
    await sendMailboxMessage(playerId, messageId, sanitizedRewards, io);

    return res.status(200).json({ success: true, message: 'Message delivered to mailbox.' });
  } catch (error) {
    console.error('❌ Error in send-mailbox-message route:', error);
    return res.status(500).json({ error: 'Server error while sending message.' });
  }
});

// ✅ POST /api/send-mailbox-message-all
router.post('/send-mailbox-message-all', async (req, res) => {
  const { messageId, customRewards = [] } = req.body;
  if (!messageId) { return res.status(400).json({ error: 'Missing messageId.' }); }
  // ✅ Sanitize rewards here (removes MongoDB subdocument _ids)
  const sanitizedRewards = customRewards.map(({ item, qty }) => ({
    item,
    qty
  }));
  try {
    const players = await Player.find({}, '_id');
    const io = req.app.get('socketio'); // assuming io was attached in server.js

console.log("📦 io from req.app.get('socketio'):", io?.constructor?.name, io?.path);
console.log("✅ req.app.get('socketio') returned. Known rooms:", Object.keys(io.sockets.adapter.rooms));
console.log("🔍 Connected sockets (count):", io.engine.clientsCount);

    for (const player of players) {
      await sendMailboxMessage(player._id.toString(), messageId, sanitizedRewards, io);
    }
    console.log(`📬 Message ${messageId} sent to ${players.length} players.`);
    return res.status(200).json({ success: true, message: `Message sent to ${players.length} players.` });
  } catch (error) {
    console.error('❌ Error in send-mailbox-message-all route:', error);
    return res.status(500).json({ error: 'Server error while sending message to all players.' });
  }
});


router.get('/messages', (req, res) => {
  const filePath = path.join(__dirname, '../tuning/messages.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error("Failed to read messages.json", err);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
    res.json(JSON.parse(data));
  });
});

router.post('/update-player-messages', async (req, res) => {
  const { playerId, messages } = req.body;

  try {
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { messages },
      { new: true }
    );
    res.json({ success: true, player: updatedPlayer });
  } catch (error) {
    console.error("Error updating player messages:", error);
    res.status(500).json({ error: 'Server error' });
  }
});





// ✅ Check if player is a developer
router.get('/check-developer-status/:username', async (req, res) => {
  const { username } = req.params;
  const pathToDevFile = path.join(__dirname, '../tuning/developerUsernames.json');

  try {
    const data = fs.readFileSync(pathToDevFile, 'utf-8');
    const developerUsernames = JSON.parse(data);

    const isDeveloper = developerUsernames.includes(username);
    res.json({ isDeveloper });
  } catch (error) {
    console.error('Error checking developer status:', error);
    res.status(500).json({ error: 'Failed to check developer status' });
  }
});

// POST /api/update-last-active - Update player's lastActive timestamp
router.post('/update-last-active', async (req, res) => {
  const { playerId } = req.body;
  
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }
  
  try {
    await Player.findByIdAndUpdate(playerId, { 
      lastActive: new Date() 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating lastActive:', error);
    res.status(500).json({ error: 'Failed to update lastActive.' });
  }
});

// GET /api/players - Get all players for editor
router.get('/players', async (req, res) => {
  try {
    const players = await Player.find({})
      .select('username settlementId accountStatus role created location icon language netWorth activeQuests completedQuests skills powers lastActive')
      .sort({ lastActive: -1 }); // Sort by most recently active first
    
    console.log(`📋 Editor: Found ${players.length} players`);
    res.json(players);
  } catch (error) {
    console.error('Error fetching all players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

module.exports = router;
