import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { useStrings } from '../../UI/StringsContext';

const ShopStation = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  TILE_SIZE,
  updateStatus,
  masterResources,
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const hasRequirement = (requirement) => {
    return (
      !requirement ||
      currentPlayer.skills?.some(skill => skill.type === requirement) ||
      currentPlayer.powers?.some(power => power.type === requirement)
    );
  };

  // Sync inventory with local storage and server
  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);

        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        const serverInventory = serverResponse.data.inventory || [];
        if (JSON.stringify(storedInventory) !== JSON.stringify(serverInventory)) {
          setInventory(serverInventory);
          localStorage.setItem('inventory', JSON.stringify(serverInventory));
        }
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  useEffect(() => {
    if (!masterResources || !stationType) return;

    const filteredRecipes = masterResources.filter((resource) =>
      resource.source === stationType &&
      (!currentPlayer.powers || !currentPlayer.powers.some(p => p.type === resource.type))
    );
    setRecipes(filteredRecipes);

    const stationResource = masterResources.find((resource) => resource.type === stationType);
    setStationEmoji(stationResource?.symbol || '🛖');
    setStationDetails(stationResource);
  }, [stationType, fetchTrigger, masterResources]);


  const handlePurchase = async (recipe) => {
    setErrorMessage('');
    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }
    const success = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });
    if (!success) return;

    const tradedQty = 1;

    if (recipe.category === "power") {
      const updatedPowers = [...(currentPlayer.powers || [])];
      const powerIndex = updatedPowers.findIndex(p => p.type === recipe.type);
      if (powerIndex >= 0) {
        updatedPowers[powerIndex].quantity += tradedQty;
      } else {
        updatedPowers.push({ type: recipe.type, quantity: tradedQty });
      }
      await axios.post(`${API_BASE}/api/update-powers`, {
        playerId: currentPlayer.playerId,
        powers: updatedPowers,
      });
      setCurrentPlayer(prev => ({
        ...prev,
        powers: updatedPowers,
      }));
      if (recipe.output && typeof recipe.qtycollected === 'number') {
        if (recipe.output === "range") {
          // ✅ Range is stored on the player document, not playersInGrid
          const updatedRange = (currentPlayer.range || 0) + recipe.qtycollected;
          await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { range: updatedRange }
          });

          // Update local player state and localStorage
          const updatedPlayer = {
            ...currentPlayer,
            range: updatedRange
          };
          setCurrentPlayer(updatedPlayer);
          localStorage.setItem('player', JSON.stringify(updatedPlayer));

          console.log(`🎯 Updated range on player document: ${updatedRange}`);
        } else {
          // Other combat stats updated in playersInGrid
          const gridPlayer = playersInGridManager.getAllPCs(gridId)?.[currentPlayer.playerId];
          if (gridPlayer) {
            const oldValue = gridPlayer[recipe.output] || 0;
            const newValue = oldValue + recipe.qtycollected;

            await playersInGridManager.updatePC(gridId, currentPlayer.playerId, {
              [recipe.output]: newValue
            });
            console.log(`🧠 Updated ${recipe.output} for player ${currentPlayer.playerId}: ${oldValue} -> ${newValue}`);
          }
        }
      }
    }
    else {
      const gainSuccess = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: recipe.type,
        quantity: recipe.qtycollected || 1,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });

      if (!gainSuccess) {
        console.warn(`Failed to gain ${recipe.type}`);
        return;
      }
    }

    await trackQuestProgress(currentPlayer, 'Buy', recipe.type, tradedQty, setCurrentPlayer);

    updateStatus(`✅ Acquired ${recipe.type}.`);
    setFetchTrigger(prev => prev + 1);
  };


  return (
    <Panel onClose={onClose} descriptionKey="1025" titleKey="1125" panelName="ShopStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>
          {/* ✅ Conditional TENT text for the Store */}
          {stationType === "Store" && (
            <p style={{ fontWeight: "bold", color: "#4CAF50" }}>
              {strings["410"]}
            </p>
          )}
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, 1);
              const meetsRequirement = hasRequirement(recipe.requires);
              const outputLabel = recipe.output ? (strings[recipe.output] || recipe.output) : '';
              const outputSummary = recipe.output && typeof recipe.qtycollected === 'number'
                ? <span style={{ color: 'blue' }}>{recipe.qtycollected > 0 ? '+' : ''}{recipe.qtycollected} for {outputLabel}</span>                : null;

              // Format costs in UI standard style
              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = recipe[`ingredient${i}`];
                const qty = recipe[`ingredient${i}qty`];
                if (!type || !qty) return '';
                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsRequirement ? 'green' : 'red';

              const details =
                `${recipe.output && typeof recipe.qtycollected === 'number' ? `<span style="color: blue;">${recipe.qtycollected > 0 ? '+' : ''}${recipe.qtycollected} for ${strings[recipe.output] || recipe.output}</span><br>` : ''}` +
                `Costs:<div>${formattedCosts}</div>` +
                (recipe.requires ? `<br><span style="color: ${skillColor};">Requires: ${recipe.requires}</span>` : '');

              const info = (
                <div className="info-content">
                  {outputSummary && (
                    <div style={{ marginBottom: '4px' }}>
                      <strong>{outputSummary}</strong>
                    </div>
                  )}
                  <div><strong>{strings[422]}</strong> 💰 {recipe.minprice || 'n/a'}</div>
                </div>
              );
              
              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={recipe.type}
                  className="resource-button"
                  details={details}
                  info={info} 
                  disabled={!affordable || !meetsRequirement}
                  onClick={() => handlePurchase(recipe)}
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[423]}</p>}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

      </div>
    </Panel>
  );
};

export default React.memo(ShopStation);