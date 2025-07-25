import API_BASE from '../../config'; 
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { handleConstruction } from '../BuildAndBuy';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/PanelContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

const BuyPanel = ({
  TILE_SIZE,
  resources,
  setResources,
  inventory,
  setInventory, 
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  masterResources, 
  masterSkills, 
  updateStatus,
}) => {
  const { closePanel } = usePanelContext();
  const [buyOptions, setBuyOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(inventoryResponse.data.inventory || []);

        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        const allResourcesData = resourcesResponse.data;
        setAllResources(allResourcesData);

        const isHomestead = currentPlayer?.location?.gtype === 'homestead';
        const purchasableItems = allResourcesData.filter(
          (resource) => resource.source === 'Buy' && (isHomestead || resource.passable !== false)
        );
        setBuyOptions(purchasableItems);
      } catch (error) {
        console.error('Error fetching buy panel data:', error);
      }
    }; 

    fetchData();
  }, [currentPlayer]);

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  return ( 
    <Panel onClose={closePanel} descriptionKey="1003" titleKey="1103" panelName="BuyPanel">
      <div className="standard-panel">
          {buyOptions.map((item) => {
            const ingredients = getIngredientDetails(item, allResources);
            const affordable = canAfford(item, inventory);
            const requirementsMet = hasRequiredSkill(item.requires);

            const formattedCosts = [1, 2, 3, 4].map((i) => {
              const type = item[`ingredient${i}`];
              const qty = item[`ingredient${i}qty`];
              if (!type || !qty) return '';

              const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
              const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
              const playerQty = inventoryQty + backpackQty;
              const color = playerQty >= qty ? 'green' : 'red';
              const symbol = allResources.find(r => r.type === type)?.symbol || '';
              return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
            }).join('');

            const skillColor = requirementsMet ? 'green' : 'red';
            const details =
              `Costs:<div>${formattedCosts}</div>` +
              (item.requires ? `<br><span style="color: ${skillColor};">Requires: ${item.requires}</span>` : '');

            return (
              <ResourceButton
                key={item.type}
                symbol={item.symbol}
                name={item.type}
                details={details}
                disabled={!affordable || !requirementsMet}
                onClick={() =>
                  affordable &&
                  requirementsMet &&
                  handleConstruction({
                    TILE_SIZE,
                    selectedItem: item.type,
                    buildOptions: buyOptions,
                    inventory,
                    setInventory,
                    backpack,
                    setBackpack,
                    resources,
                    setResources,
                    setErrorMessage: console.error,
                    currentPlayer,
                    setCurrentPlayer,
                    gridId,
                    updateStatus,
                  })
                }
              />
            );
          })}
        </div>
    </Panel>
  );
};

export default React.memo(BuyPanel);