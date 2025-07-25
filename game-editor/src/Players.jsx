import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import './Players.css';
import API_BASE from './config';

const Players = ({ selectedFrontier, selectedSettlement, frontiers, settlements, activePanel }) => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Function to get settlement name by ID
  const getSettlementName = (settlementId) => {
    const settlement = settlements.find(s => s._id === settlementId);
    return settlement ? settlement.name : 'Unknown Settlement';
  };

  // Fetch players from the database
  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 Fetching players from database...');
      const response = await axios.get(`${API_BASE}/api/players`);
      console.log('✅ Players fetched:', response.data);
      setPlayers(response.data || []);
    } catch (error) {
      console.error('❌ Failed to fetch players:', error);
      setError('Failed to fetch players from database');
    } finally {
      setLoading(false);
    }
  };

  // Fetch players when component mounts or when activePanel changes to 'players'
  useEffect(() => {
    if (activePanel === 'players') {
      fetchPlayers();
    }
  }, [activePanel]);

  // Memoized filtered players based on current frontier/settlement selection
  const filteredPlayers = useMemo(() => {
    let filtered = players;

    // Filter by frontier if one is selected
    if (selectedFrontier) {
      const frontierSettlements = settlements
        .filter(s => String(s.frontierId?._id || s.frontierId) === String(selectedFrontier))
        .map(s => s._id);

      filtered = filtered.filter(player => 
        frontierSettlements.includes(player.settlementId)
      );
    }

    // Further filter by settlement if one is selected
    if (selectedSettlement) {
      filtered = filtered.filter(player => 
        String(player.settlementId) === String(selectedSettlement)
      );
    }

    return filtered;
  }, [players, selectedFrontier, selectedSettlement, settlements]);

  // Handle player row selection
  const handlePlayerSelect = (player) => {
    console.log('🎯 Selected player:', player.username);
    console.log('📊 Player skills:', player.skills);
    console.log('⚡ Player powers:', player.powers);
    
    // Validate skills data
    if (player.skills && Array.isArray(player.skills)) {
      player.skills.forEach((skill, index) => {
        if (typeof skill === 'object' && skill !== null) {
          console.log(`🔧 Skill ${index}:`, skill);
        }
      });
    }
    
    // Validate powers data
    if (player.powers && Array.isArray(player.powers)) {
      player.powers.forEach((power, index) => {
        if (typeof power === 'object' && power !== null) {
          console.log(`⚡ Power ${index}:`, power);
        }
      });
    }
    
    setSelectedPlayer(player);
  };

  // Handle column sorting
  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  // Sort and filter players
  const sortedAndFilteredPlayers = useMemo(() => {
    let filtered = filteredPlayers;

    // Apply sorting if configured
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle special cases for sorting
        if (sortConfig.key === 'created' || sortConfig.key === 'lastActive') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else if (sortConfig.key === 'netWorth') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = (bValue || '').toLowerCase();
        } else if (aValue === null || aValue === undefined) {
          aValue = '';
        }
        
        if (bValue === null || bValue === undefined) {
          bValue = '';
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [filteredPlayers, sortConfig]);

  return (
    <div className="players-layout">
      {/* BASE PANEL UI - Always visible */}
      <div className="players-base-panel">
        <h2>😀 Players</h2>
        
        <div className="players-stats">
          <p><strong>Total Players:</strong> {players.length}</p>
          {(selectedFrontier || selectedSettlement) && (
            <p><strong>Filtered Players:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
          {selectedFrontier && !selectedSettlement && (
            <p><strong>In Current Frontier:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
          {selectedSettlement && (
            <p><strong>In Current Settlement:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
        </div>

        <button onClick={fetchPlayers} className="refresh-btn">
          🔄 Refresh Data
        </button>

        {/* Selected Player Info */}
        {selectedPlayer && (
          <div className="selected-player-info">
            <h3>Selected Player:</h3>
            <div className="player-details">
              <h3><strong>{selectedPlayer.icon || '😀'} {selectedPlayer.username}</strong></h3>
            </div>
            
            {/* Placeholder for future player management buttons */}
            <div className="player-actions">
              <h4>Actions</h4>
              <button className="action-btn" disabled>
                View Details
              </button>
              <button className="action-btn" disabled>
                Send Message
              </button>
              <button className="action-btn" disabled>
                Modify Account
              </button>
              <p className="coming-soon">Functions coming soon...</p>
            </div>

            {/* Player Stats */}
            <div className="player-stats">
              <p><strong>Active Quests:</strong> {selectedPlayer.activeQuests?.length || 0}</p>
              <p><strong>Completed Quests:</strong> {selectedPlayer.completedQuests?.length || 0}</p>
              
              {selectedPlayer.skills && selectedPlayer.skills.length > 0 && (
                <div className="skills-section">
                  <p><strong>Skills:</strong></p>
                  <ul className="skills-list">
                    {selectedPlayer.skills.map((skill, index) => {
                      // Handle different skill data formats
                      if (typeof skill === 'string') {
                        return <li key={index}>{skill}</li>;
                      } else if (skill && typeof skill === 'object') {
                        const name = skill.name || skill.type || 'Unknown Skill';
                        const level = skill.level || skill.quantity || '';
                        return <li key={index}>{name}{level ? `: ${level}` : ''}</li>;
                      }
                      return <li key={index}>Invalid skill data</li>;
                    })}
                  </ul>
                </div>
              )}
              
              {selectedPlayer.powers && selectedPlayer.powers.length > 0 && (
                <div className="powers-section">
                  <p><strong>Powers:</strong></p>
                  <ul className="powers-list">
                    {selectedPlayer.powers.map((power, index) => {
                      // Handle different power data formats
                      if (typeof power === 'string') {
                        return <li key={index}>{power}</li>;
                      } else if (power && typeof power === 'object') {
                        const name = power.name || power.type || 'Unknown Power';
                        return <li key={index}>{name}</li>;
                      }
                      return <li key={index}>Invalid power data</li>;
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="players-main-container">
        {loading ? (
          <div className="loading">Loading players...</div>
        ) : error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={fetchPlayers}>Retry</button>
          </div>
        ) : (
          <div className="players-table-container">
            <table className="players-table">
              <thead>
                <tr>
                  <th 
                    onClick={() => handleSort('username')}
                    className={`sortable ${sortConfig.key === 'username' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Username {sortConfig.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('language')}
                    className={`sortable ${sortConfig.key === 'language' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Language {sortConfig.key === 'language' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('netWorth')}
                    className={`sortable ${sortConfig.key === 'netWorth' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Net Worth {sortConfig.key === 'netWorth' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('accountStatus')}
                    className={`sortable ${sortConfig.key === 'accountStatus' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Account Status {sortConfig.key === 'accountStatus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('role')}
                    className={`sortable ${sortConfig.key === 'role' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Role {sortConfig.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('created')}
                    className={`sortable ${sortConfig.key === 'created' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Created {sortConfig.key === 'created' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('lastActive')}
                    className={`sortable ${sortConfig.key === 'lastActive' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Last Active {sortConfig.key === 'lastActive' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Last Location</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredPlayers.map((player) => (
                  <tr 
                    key={player._id}
                    className={selectedPlayer?._id === player._id ? 'selected' : ''}
                    onClick={() => handlePlayerSelect(player)}
                  >
                    <td className="username">
                      {player.icon || '😀'} {player.username}
                    </td>
                    <td>{player.language || 'Unknown'}</td>
                    <td>{player.netWorth || 0}</td>
                    <td>
                      <span className={`status ${player.accountStatus?.toLowerCase() || 'free'}`}>
                        {player.accountStatus || 'Free'}
                      </span>
                    </td>
                    <td>
                      <span className={`role ${player.role?.toLowerCase() || 'citizen'}`}>
                        {player.role || 'Citizen'}
                      </span>
                    </td>
                    <td>{player.created ? new Date(player.created).toLocaleDateString() : 'Unknown'}</td>
                    <td>
                      {player.lastActive ? (
                        <span title={new Date(player.lastActive).toLocaleString()}>
                          {(() => {
                            const now = new Date();
                            const lastActive = new Date(player.lastActive);
                            const diffMs = now - lastActive;
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffMinutes = Math.floor(diffMs / (1000 * 60));
                            
                            if (diffDays > 0) return `${diffDays}d ago`;
                            if (diffHours > 0) return `${diffHours}h ago`;
                            if (diffMinutes > 0) return `${diffMinutes}m ago`;
                            return 'Just now';
                          })()}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </td>
                    <td>
                      {player.location?.gtype ? (
                        <span>
                          {player.location.gtype} ({player.location.x}, {player.location.y})
                        </span>
                      ) : (
                        'Unknown'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {sortedAndFilteredPlayers.length === 0 && !loading && !error && (
              <div className="no-players">
                {selectedSettlement ? 
                  'No players found in the selected settlement.' :
                  selectedFrontier ? 
                    'No players found in the selected frontier.' :
                    'No players found.'
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Players;