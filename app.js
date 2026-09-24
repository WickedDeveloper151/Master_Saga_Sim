/**
 * Yu-Gi-Oh! Master Saga Pack Opener
 * Core Application Script
 * 
 * This file coordinates the frontend interactive features of the pack opening simulator.
 * It connects to the official YGOPRODeck database, structures card pools by rarity,
 * simulates card packs based on verified Master Duel rates, manages pity rules, 
 * renders dynamic tabs & visual assets, and handles card collections exporting.
 */

// ==========================================
// Global Application State Tracking
// ==========================================

// Stores the comprehensive array of processed Master Duel card objects fetched from the API.
let allMasterDuelCards = [];

// Organized index of all Master Duel cards, sorted by rarity (UR, SR, R, N).
// Used for fast selection during standard general pool pulls.
let indexedMasterPool = { UR: [], SR: [], R: [], N: [] };

// Categorized subset of cards belonging to the active Secret Pack archetype.
// Used when pulling cards from a featured/secret card pool.
let activePackPool = { UR: [], SR: [], R: [], N: [] };

// Tracks the ID string of the currently selected/active pack. Defaults to "master".
let selectedPackId = "master"; 

// Tracks the state of the Pity timer per pack type (key: pack_id -> boolean).
// If true, the next 10-pack pull from this pack will guarantee an Ultra Rare (UR).
let pityTimerActive = {};

// Aggregates session metrics to track progress, gem usage, and rarity counts.
let sessionStats = {
    packsOpened: 0,
    gemsSpent: 0,
    urCount: 0,
    srCount: 0,
    rCount: 0,
    nCount: 0,
    totalCards: 0
};

// Cumulative list of all card objects pulled during the active session.
let sessionPulledCards = []; 

// Card objects from the single most recent pull operation (8 cards for single, 80 cards for 10-pack).
let currentPackPulls = [];   

// Tracks the currently focused tab in the 10-pack results interface ("all" or individual pack indices 0-9).
let currentActiveTab = "all"; 

// ==========================================
// DOM Element Cache
// ==========================================
// Caches references to DOM nodes to optimize query and manipulation overhead.
const DOM = {
    loadingOverlay: document.getElementById("loading-overlay"),
    loadingProgress: document.getElementById("loading-progress"),
    loadingStatus: document.getElementById("loading-status"),
    packCardsList: document.getElementById("pack-cards-list"),
    secretPackInfo: document.getElementById("secret-pack-info"),
    featuredArchetypesList: document.getElementById("featured-archetypes-list"),
    pull1Btn: document.getElementById("pull-1-btn"),
    pull10Btn: document.getElementById("pull-10-btn"),
    pityIndicator: document.getElementById("pity-indicator"),
    pityStatusText: document.getElementById("pity-status-text"),
    statsPacks: document.getElementById("stats-packs"),
    statsGems: document.getElementById("stats-gems"),
    barUr: document.getElementById("bar-ur"),
    barSr: document.getElementById("bar-sr"),
    barR: document.getElementById("bar-r"),
    barN: document.getElementById("bar-n"),
    countUr: document.getElementById("count-ur"),
    countSr: document.getElementById("count-sr"),
    countR: document.getElementById("count-r"),
    countN: document.getElementById("count-n"),
    exportYdkBtn: document.getElementById("export-ydk-btn"),
    exportTxtBtn: document.getElementById("export-txt-btn"),
    resetBtn: document.getElementById("reset-btn"),
    activeStatus: document.getElementById("active-status"),
    globalCounter: document.getElementById("global-counter"),
    resultsHeader: document.getElementById("results-header"),
    revealAllBtn: document.getElementById("reveal-all-btn"),
    packTabs: document.getElementById("pack-tabs"),
    cardGrid: document.getElementById("card-grid"),
    secretPacksCount: document.getElementById("unlocked-packs-count"),
    secretPacksLog: document.getElementById("secret-packs-log"),
    toast: document.getElementById("toast"),
    workspace: document.querySelector(".workspace")
};

/**
 * Utility to check if a card's name or ID exists in a target array.
 * Supports comparison with both string names (case-insensitive) and numeric IDs.
 * 
 * @param {Object} card - Card object to evaluate.
 * @param {Array<string|number>} list - List of card names or IDs.
 * @returns {boolean} True if card is found in list, false otherwise.
 */
function isCardInList(card, list) {
    if (!list || !Array.isArray(list)) return false;
    return list.some(item => {
        if (typeof item === "string") {
            return card.name.toLowerCase() === item.toLowerCase();
        } else if (typeof item === "number") {
            return card.id === item;
        }
        return false;
    });
}

// ==========================================
// 1. Initial Card Data Fetch & Setup
// ==========================================
/**
 * Contacts the YGOPRODeck API to retrieve Master Duel card info.
 * Normalizes, filters, handles custom/added cards, structures the card indexes,
 * and boots up the interactive interface once the process completes.
 */
async function initializeApp() {
    updateLoadingProgress(10, "Establishing connection to YGOPRODeck API...");
    try {
        // Query the database API requesting cards specifically formatted for Master Duel.
        // misc=yes is requested to fetch md_rarity field inside the misc_info object.
        const response = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php?format=Master%20Duel&misc=yes");
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        updateLoadingProgress(40, "Downloading full Master Duel card database...");
        const payload = await response.json();
        
        updateLoadingProgress(70, "Indexing cards and processing rarities...");
        
        // Maps raw database/API rarity terms to standardized application-level shortcodes.
        const rarityMap = {
            "ULTRA RARE": "UR",
            "SUPER RARE": "SR",
            "RARE": "R",
            "COMMON": "N"
        };
        
        // Filters raw data, ensuring only card objects with valid Master Duel rarity labels are indexed.
        allMasterDuelCards = payload.data.filter(card => {
            if (card.misc_info && card.misc_info[0] && card.misc_info[0].md_rarity) {
                const rawRarity = card.misc_info[0].md_rarity.toUpperCase();
                const mappedRarity = rarityMap[rawRarity];
                if (mappedRarity) {
                    // Map the nested API Master Duel rarity to a convenient top-level property
                    card.md_rarity = mappedRarity;
                    return true;
                }
            }
            return false;
        });
        
        // Dynamic custom cards injection. Appends custom definitions if loaded from other scripts (e.g. packs.js)
        if (typeof CUSTOM_CARDS !== "undefined" && Array.isArray(CUSTOM_CARDS)) {
            allMasterDuelCards.push(...CUSTOM_CARDS);
        }
        
        // Apply card exclusion logic if EXCLUDED_CARDS is specified
        if (typeof EXCLUDED_CARDS !== "undefined" && Array.isArray(EXCLUDED_CARDS)) {
            allMasterDuelCards = allMasterDuelCards.filter(card => !isCardInList(card, EXCLUDED_CARDS));
        }
        
        // Categorize master cards array into sub-arrays mapped by rarity UR, SR, R, N.
        // This structure allows fast uniform random index draws based on rolls.
        allMasterDuelCards.forEach(card => {
            const rarity = card.md_rarity;
            if (indexedMasterPool[rarity]) {
                indexedMasterPool[rarity].push(card);
            }
        });

        updateLoadingProgress(100, "Initialization complete!");
        
        // Smoothly fade out the loader screen overlay and show the functional application
        setTimeout(() => {
            DOM.loadingOverlay.classList.add("hidden");
            setupEventListeners();
            renderPackSelector();
            updatePityIndicator();
        }, 500);

    } catch (error) {
        console.error(error);
        // Display red status failure feedback to help troubleshoot networks
        DOM.loadingStatus.innerHTML = `<span style="color: var(--accent-red)">Failed to load: ${error.message}. Please refresh the page.</span>`;
        DOM.loadingProgress.style.backgroundColor = "var(--accent-red)";
    }
}

/**
 * Updates progress bar percentage and visual text tracker.
 */
function updateLoadingProgress(percent, text) {
    DOM.loadingProgress.style.width = `${percent}%`;
    DOM.loadingStatus.textContent = text;
}

// ==========================================
// 2. Pack Selection Rendering & Logic
// ==========================================
/**
 * Renders/Updates the Pack Selection sidebar list.
 * Evaluates session history to dynamically unlock Secret Packs as qualifying high rarities are pulled.
 */
function renderPackSelector() {
    const listContainer = DOM.packCardsList;
    listContainer.innerHTML = "";
    
    // -- A. Master Pack Selection Card Rendering --
    const masterCard = document.createElement("div");
    masterCard.className = `pack-card unlocked ${selectedPackId === "master" ? "active" : ""}`;
    masterCard.innerHTML = `
        <div class="pack-card-accent"></div>
        <div class="pack-card-content">
            <div class="pack-card-header">
                <span class="pack-card-title">Master Pack</span>
                <span class="pack-card-status">✦ GENERAL</span>
            </div>
            <div class="pack-card-description">All Master Duel Cards Pool</div>
            <div class="pack-card-archetypes">
                <span class="pack-card-tag all-cards">Full Database</span>
            </div>
        </div>
    `;
    masterCard.addEventListener("click", () => selectPack("master"));
    listContainer.appendChild(masterCard);
    
    // -- B. Secret Packs Selection Card Rendering (Sorted: Unlocked first, then Locked, and alphabetically) --
    const sortedSecretPackKeys = Object.keys(SECRET_PACKS).map(key => {
        return {
            key,
            config: SECRET_PACKS[key],
            unlocked: isSecretPackUnlocked(key)
        };
    }).sort((a, b) => {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return a.config.name.localeCompare(b.config.name);
    });

    sortedSecretPackKeys.forEach(({ key, config, unlocked }) => {
        const cardEl = document.createElement("div");
        cardEl.className = `pack-card ${unlocked ? "unlocked" : "locked"} ${selectedPackId === key ? "active" : ""}`;
        
        // Show only the first 3 featured archetypes as micro tag labels
        const displayTags = config.archetypes.slice(0, 3).map(arch => 
            `<span class="pack-card-tag">${arch}</span>`
        ).join("");
        
        // Dynamically shrink title font-size if the pack name is too long
        const isLongName = config.name.length > 20;
        const titleStyle = isLongName ? "font-size: 11.5px; line-height: 1.25;" : "";
        
        cardEl.innerHTML = `
            <div class="pack-card-accent"></div>
            <div class="pack-card-content">
                <div class="pack-card-header">
                    <span class="pack-card-title" style="${titleStyle}">${config.name}</span>
                    <span class="pack-card-status">${unlocked ? "✦ UNLOCKED" : "🔒 LOCKED"}</span>
                </div>
                
            </div>
        `;
        cardEl.addEventListener("click", () => selectPack(key));
        listContainer.appendChild(cardEl);
    });
}

/**
 * Focuses selection onto the specified pack.
 */
function selectPack(packId) {
    selectedPackId = packId;
    handlePackChange();
}

// ==========================================
// 3. User Interaction Event Setup
// ==========================================
/**
 * Configures event listeners for the primary application command buttons.
 */
function setupEventListeners() {
    DOM.pull1Btn.addEventListener("click", () => handlePull(1));
    DOM.pull10Btn.addEventListener("click", () => handlePull(10));
    DOM.revealAllBtn.addEventListener("click", handleRevealAll);
    DOM.exportYdkBtn.addEventListener("click", handleExportYdk);
    DOM.exportTxtBtn.addEventListener("click", handleExportTxt);
    DOM.resetBtn.addEventListener("click", handleResetSession);
}

// ==========================================
// 4. Pack Pool Adjustments & Pity Updates
// ==========================================
/**
 * Processes pool configuration and UI updates when the active pack selection shifts.
 */
function handlePackChange() {
    const packVal = selectedPackId;
    
    if (packVal === "master") {
        DOM.secretPackInfo.classList.add("hidden");
        // Clear active specific pool; empty state denotes fallback to standard master pool lists.
        activePackPool = { UR: [], SR: [], R: [], N: [] };
    } else {
        const config = SECRET_PACKS[packVal];
        DOM.secretPackInfo.classList.remove("hidden");
        
        // Render tag pills for all featured archetypes inside the information banner
        DOM.featuredArchetypesList.innerHTML = config.archetypes
            .map(arch => `<span class="tag">${arch}</span>`).join("");
            
        // Reset and populate active pool with card objects that correspond to featured archetypes
        activePackPool = { UR: [], SR: [], R: [], N: [] };
        
        allMasterDuelCards.forEach(card => {
            // Skip cards explicitly excluded from this secret pack
            if (config.exclude_cards && isCardInList(card, config.exclude_cards)) {
                return;
            }

            const hasArchMatch = card.archetype && config.archetypes.some(arch => 
                card.archetype.toLowerCase() === arch.toLowerCase()
            );
            const hasNameMatch = config.archetypes.some(arch => 
                card.name.toLowerCase().includes(arch.toLowerCase())
            );
            
            // Check if card matches explicitly configured card IDs/names
            const isExplicitMatch = isCardInList(card, config.cards);
            
            // Categorize into the active pack pool split by rarity
            if (hasArchMatch || hasNameMatch || isExplicitMatch) {
                const r = card.md_rarity.toUpperCase();
                if (activePackPool[r]) {
                    activePackPool[r].push(card);
                }
            }
        });
    }
    
    updatePityIndicator();
    renderPackSelector(); // Redraw menu to apply visual active CSS borders
}

/**
 * Synchronizes the visual pity timer notification header (glowing orange banner)
 * based on whether pity is currently active for the chosen pack selection.
 */
function updatePityIndicator() {
    const packVal = selectedPackId;
    const isPity = pityTimerActive[packVal] === true;
    
    if (isPity) {
        DOM.pityIndicator.className = "pity-indicator active-pity";
        DOM.pityStatusText.textContent = "GUARANTEED UR ON NEXT 10-PULL";
    } else {
        DOM.pityIndicator.className = "pity-indicator no-pity";
        DOM.pityStatusText.textContent = "INACTIVE";
    }
}

// ==========================================
// 5. Probability Core & Gacha Engine
// ==========================================
/**
 * Picks a random card uniformly from the target pool matching the resolved rarity odds slot.
 * Handles fallbacks, foil chance computations, and specific gacha distributions.
 * 
 * Distribution Probability Rates (In Line with Master Duel odds):
 * - "standard": UR 2.5%, SR 7.5%, R 35.0%, N 55.0%
 * - "rare_or_higher": UR 2.5%, SR 7.5%, R 90.0%
 * - "guaranteed_sr_ur": UR 20.0%, SR 80.0% (Slot 8 on pack 10)
 * - "guaranteed_ur": UR 100.0% (Slot 8 on pack 10 if pity is active)
 * 
 * @param {"master"|"secret"} poolType - Choose between standard Master pool or Featured active pack pool.
 * @param {string} probabilitySlot - Set category identifier to trigger correct percentage curves.
 * @returns {Object} Card database object extended with its resolved "foilFinish" string.
 */
function getRandomCard(poolType, probabilitySlot) {
    // 1. Determine card rarity using standard decimal pseudo-random rolls [0, 1)
    let rarity = "N";
    const rand = Math.random();
    
    if (probabilitySlot === "standard") {
        if (rand < 0.025) rarity = "UR";
        else if (rand < 0.10) rarity = "SR";
        else if (rand < 0.45) rarity = "R";
        else rarity = "N";
    } else if (probabilitySlot === "rare_or_higher") {
        if (rand < 0.025) rarity = "UR";
        else if (rand < 0.10) rarity = "SR";
        else rarity = "R";
    } else if (probabilitySlot === "guaranteed_sr_ur") {
        if (rand < 0.20) rarity = "UR";
        else rarity = "SR";
    } else if (probabilitySlot === "guaranteed_ur") {
        rarity = "UR";
    }
    
    // 2. Select card pool (routing and Secret-to-Master fallback behavior)
    let cards = [];
    if (poolType === "master") {
        cards = indexedMasterPool[rarity];
    } else if (poolType === "secret") {
        // Fallback: If a secret pack contains no matching cards for a specific rarity
        // (such as rare cards), pull from the master pool at that rarity to avoid errors or crashes.
        cards = activePackPool[rarity];
        if (!cards || cards.length === 0) {
            cards = indexedMasterPool[rarity];
        }
    }
    
    // 3. Select a card uniformly at random from the selected array
    const selectedCard = cards[Math.floor(Math.random() * cards.length)];
    
    // 4. Apply foil check (SR/UR only)
    let finish = "Normal";
     const foilRand = Math.random();
    if (foilRand < 0.10) {
            finish = "Glossy";
        };
    if (rarity === "UR" || rarity === "SR") {
        const foilRand = Math.random();
        if (foilRand < 0.01) {
            finish = "Royal";
        }
    }
    
    // Return a shallow copy of card data supplemented with the determined foil treatment
    return {
        ...selectedCard,
        foilFinish: finish
    };
}

/**
 * Simulates opening a single pack containing exactly 8 card slots.
 * Matches Master Duel packaging logic.
 * 
 * Structural Slot Distribution:
 * - Slots 1-4: Standard odds, pulled strictly from the general MASTER pool.
 * - Slots 5-7: Standard odds, pulled from Secret pool (for Secret Packs) or general Master pool (for Master Pack).
 * - Slot 8 (Guaranteed Slot): 
 *   - "guaranteed_ur" if 10th pack of a bundle AND pity timer is active.
 *   - "guaranteed_sr_ur" if 10th pack of a bundle (no pity active).
 *   - "rare_or_higher" for standard packs 1 through 9 or single pulls.
 * 
 * @returns {Array<Object>} List containing exactly 8 card objects.
 */
function pullSinglePack(packType, is10thPack, hasPityUR) {
    const pack = [];
    const isSecret = packType !== "master";
    
    // Slots 1-4: Always general Master Pack pool
    for (let i = 0; i < 4; i++) {
        pack.push(getRandomCard("master", "standard"));
    }
    
    // Slots 5-7: Standard odds, drawn from Featured pool (Secret Packs) or General pool (Master Pack)
    for (let i = 0; i < 3; i++) {
        pack.push(getRandomCard(isSecret ? "secret" : "master", "standard"));
    }
    
    // Slot 8: The designated guaranteed card slot
    if (is10thPack) {
        if (hasPityUR) {
            pack.push(getRandomCard(isSecret ? "secret" : "master", "guaranteed_ur"));
        } else {
            pack.push(getRandomCard(isSecret ? "secret" : "master", "guaranteed_sr_ur"));
        }
    } else {
        pack.push(getRandomCard(isSecret ? "secret" : "master", "rare_or_higher"));
    }
    
    return pack;
}

// ==========================================
// 6. Pull Operation Handlers & Aggregators
// ==========================================
/**
 * Drives the core simulation pull trigger. Handles single pulls or 10-pack bundles.
 * Spends gems, aggregated state calculations, resolves pity transitions, and redraws components.
 */
function handlePull(packCount) {
    const packType = selectedPackId;
    currentPackPulls = [];
    currentActiveTab = "all";
    
    // Update statistical counters and deduct virtual currency
    sessionStats.packsOpened += packCount;
    sessionStats.gemsSpent += packCount * 100;
    
    if (packCount === 1) {
        // Simple Single Pack (8 cards)
        const pack = pullSinglePack(packType, false, false);
        currentPackPulls = pack;
        sessionPulledCards.push(...pack);
        
        // Accumulate statistics
        accumulateStats(pack);
        
        // Hide multi-pack selector tabs
        DOM.packTabs.classList.add("hidden");
    } else {
        // 10 Pack Bundle (80 cards total)
        let containsUR = false;
        const hasPityUR = (pityTimerActive[packType] === true);
        
        for (let p = 0; p < 10; p++) {
            const is10thPack = (p === 9);
            // Evaluate standard single pack pulling. Pity is only resolved on the 10th pack final slot
            const pack = pullSinglePack(packType, is10thPack, is10thPack && hasPityUR);
            currentPackPulls.push(...pack);
            sessionPulledCards.push(...pack);
            
            // Scan for Ultra Rares (URs) across the 10-pack bundle to govern pity resets
            if (pack.some(c => c.md_rarity.toUpperCase() === "UR")) {
                containsUR = true;
            }
            accumulateStats(pack);
        }
        
        // Pity Management State Rules:
        // Pulling at least 1 UR card in a 10-pack bundle resets/deactivates the pity tracker for this pack.
        // Failing to pull any UR card in a 10-pack bundle triggers pity active status, guaranteeing a UR next time.
        if (containsUR) {
            pityTimerActive[packType] = false;
        } else {
            pityTimerActive[packType] = true;
        }
        
        // Setup visual pack-filtering tabs
        setupPackTabs();
    }
    
    // Enable collection download buttons now that content exists
    DOM.exportYdkBtn.removeAttribute("disabled");
    DOM.exportTxtBtn.removeAttribute("disabled");
    
    // Synchronize UI component displays
    updateStatsDOM();
    updatePityIndicator();
    updateSecretPacksDrawer();
    renderPackSelector(); // Re-render selectors to unlock any newly discovered Secret Packs
    
    // Reveal grid results wrapper
    DOM.resultsHeader.classList.remove("hidden");
    renderGrid();
    
    // Print feedback message
    DOM.activeStatus.textContent = `Pulled ${packCount} pack${packCount > 1 ? 's' : ''}!`;
}

/**
 * Counts and registers individual rarity counts into global statistics.
 */
function accumulateStats(cardsList) {
    cardsList.forEach(card => {
        const r = card.md_rarity.toUpperCase();
        if (r === "UR") sessionStats.urCount++;
        else if (r === "SR") sessionStats.srCount++;
        else if (r === "R") sessionStats.rCount++;
        else if (r === "N") sessionStats.nCount++;
        sessionStats.totalCards++;
    });
}

/**
 * Computes card distributions and triggers DOM element state changes in the left sidebar if elements exist.
 */
function updateStatsDOM() {
    if (DOM.statsPacks) DOM.statsPacks.textContent = sessionStats.packsOpened;
    if (DOM.statsGems) DOM.statsGems.textContent = sessionStats.gemsSpent.toLocaleString();
    if (DOM.globalCounter) DOM.globalCounter.textContent = `Total Pulled: ${sessionStats.totalCards} Cards`;
    
    // Computes ratios based on session total pulled quantities
    const urPct = sessionStats.totalCards ? ((sessionStats.urCount / sessionStats.totalCards) * 100).toFixed(1) : 0;
    const srPct = sessionStats.totalCards ? ((sessionStats.srCount / sessionStats.totalCards) * 100).toFixed(1) : 0;
    const rPct = sessionStats.totalCards ? ((sessionStats.rCount / sessionStats.totalCards) * 100).toFixed(1) : 0;
    const nPct = sessionStats.totalCards ? ((sessionStats.nCount / sessionStats.totalCards) * 100).toFixed(1) : 0;
    
    if (DOM.countUr) DOM.countUr.textContent = `${sessionStats.urCount} (${urPct}%)`;
    if (DOM.countSr) DOM.countSr.textContent = `${sessionStats.srCount} (${srPct}%)`;
    if (DOM.countR) DOM.countR.textContent = `${sessionStats.rCount} (${rPct}%)`;
    if (DOM.countN) DOM.countN.textContent = `${sessionStats.nCount} (${nPct}%)`;
    
    if (DOM.barUr) DOM.barUr.style.width = `${urPct}%`;
    if (DOM.barSr) DOM.barSr.style.width = `${srPct}%`;
    if (DOM.barR) DOM.barR.style.width = `${rPct}%`;
    if (DOM.barN) DOM.barN.style.width = `${nPct}%`;
}

// ==========================================
// 7. Results Tab Navigation Bar
// ==========================================
/**
 * Renders the filter buttons on the results panel for 10-pack results inspection.
 */
function setupPackTabs() {
    DOM.packTabs.innerHTML = "";
    DOM.packTabs.classList.remove("hidden");
    
    // General Tab: Views all 80 cards simultaneously
    const allTab = document.createElement("button");
    allTab.className = "pack-tab active";
    allTab.textContent = "VIEW ALL (80)";
    allTab.addEventListener("click", () => selectTab("all", allTab));
    DOM.packTabs.appendChild(allTab);
    
    // Pack Tabs: Targets single pack results chunks (8 cards each)
    for (let i = 0; i < 10; i++) {
        const tab = document.createElement("button");
        tab.className = "pack-tab";
        tab.textContent = `PACK ${i + 1}`;
        tab.addEventListener("click", () => selectTab(i, tab));
        DOM.packTabs.appendChild(tab);
    }
}

/**
 * Switch focus state of pack results filter.
 */
function selectTab(tabIndex, tabEl) {
    // Clear active classes across all sibling tab options
    document.querySelectorAll(".pack-tab").forEach(t => t.classList.remove("active"));
    tabEl.classList.add("active");
    
    currentActiveTab = tabIndex;
    renderGrid();
}

// ==========================================
// 8. Results Card Grid Rendering
// ==========================================
/**
 * Constructs and positions card layouts inside the results container.
 * Determines slices dynamically depending on active tab, applying glows, foil films, and flip-triggers.
 */
function renderGrid() {
    DOM.cardGrid.innerHTML = "";
    DOM.cardGrid.className = "card-grid";
    
    let cardsToRender = [];
    if (currentActiveTab === "all") {
        cardsToRender = currentPackPulls;
    } else {
        // Extract 8 cards for specific pack index
        const startIndex = currentActiveTab * 8;
        cardsToRender = currentPackPulls.slice(startIndex, startIndex + 8);
    }
    
    cardsToRender.forEach((card, idx) => {
        const cardWrapper = document.createElement("div");
        cardWrapper.className = "card-wrapper";
        
        // Assembles HTML wrapper for card structures. 
        // Emulates facedown status using 3D perspective transforms. Glow classes are appended matching card rarities.
        cardWrapper.innerHTML = `
            <div class="card-inner">
                <!-- Back Face (Facedown state) -->
                <div class="card-face card-back">
                    <div class="card-back-ornament"></div>
                </div>
                <!-- Front Face (Revealed Card Artwork and Stats) -->
                <div class="card-face card-front ${card.md_rarity.toLowerCase()}-glow">
                    <div class="card-img-container">
                        <img src="${card.card_images[0].image_url_small}" alt="${card.name}" loading="lazy">
                        ${card.foilFinish !== "Normal" ? `<div class="${card.foilFinish === 'Royal' ? 'royal-hologram' : 'hologram-shimmer'}"></div>` : ""}
                        ${card.foilFinish !== "Normal" ? `<div class="card-finish-badge ${card.foilFinish.toLowerCase()}">${card.foilFinish.toUpperCase()}</div>` : ""}
                        <div class="card-rarity-badge badge-${card.md_rarity.toLowerCase()}">${card.md_rarity}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Single-click listener triggers flipping transition to face-up state
        cardWrapper.addEventListener("click", () => {
            if (!cardWrapper.classList.contains("flipped")) {
                cardWrapper.classList.add("flipped");
                cardWrapper.setAttribute("title", "Click to view on Yugipedia");
                updateSecretPacksDrawer();
            } else {
                // Navigate to the card's YGOPRODeck page on subsequent clicks
                let searchId = card.name;
                if (card.id === 99999999) {
                    searchId = 83737830; // Map Gemini CLI Assistant custom card to Gemini Soldier
                }
                window.open(`https://yugipedia.com/wiki/${encodeURIComponent(card.name)}_(Master_Duel)`, "_blank", "noopener,noreferrer");
            }
        });
        
        DOM.cardGrid.appendChild(cardWrapper);
    });
}

/**
 * Loops through all active card wrappers and flips them face-up using a timed cascading visual delay.
 */
function handleRevealAll() {
    const wrappers = document.querySelectorAll(".card-wrapper");
    wrappers.forEach((wrapper, index) => {
        setTimeout(() => {
            wrapper.classList.add("flipped");
            wrapper.setAttribute("title", "Click to view on YGOPRODeck");
            // Check if this flip completes all card reveals and updates the drawer
            if (index === wrappers.length - 1) {
                setTimeout(() => {
                    updateSecretPacksDrawer();
                }, 100); // Tiny buffer for animation completion
            }
        }, index * 80); // Cascades every 80ms for an elegant organic reveal look
    });
}

// ==========================================
// 9. Unlocked Secret Packs Drawer Logger
// ==========================================
/**
 * Checks if a specific Secret Pack is unlocked by analyzing pulled cards in the session.
 * A pack is unlocked if the user has pulled an SR or UR matching its featured archetypes
 * or explicitly designated card IDs.
 */
function isSecretPackUnlocked(packKey) {
    const config = SECRET_PACKS[packKey];
    if (!config) return false;
    return sessionPulledCards.some(card => {
        const isHighRarity = card.md_rarity === "UR" || card.md_rarity === "SR";
        if (!isHighRarity) return false;
        
        // If the card is explicitly excluded from this secret pack, it does not count as featured and cannot unlock it.
        if (config.exclude_cards && isCardInList(card, config.exclude_cards)) {
            return false;
        }
        
        const hasArchMatch = card.archetype && config.archetypes.some(arch => 
            card.archetype.toLowerCase() === arch.toLowerCase()
        );
        const hasNameMatch = config.archetypes.some(arch => 
            card.name.toLowerCase().includes(arch.toLowerCase())
        );
        const isExplicitMatch = isCardInList(card, config.cards);
        
        return hasArchMatch || hasNameMatch || isExplicitMatch;
    });
}

/**
 * Returns true if all card wrappers currently rendered in the results grid have been flipped face-up.
 */
function areAllCardsOpened() {
    const wrappers = document.querySelectorAll(".card-wrapper");
    if (wrappers.length === 0) return false;
    return Array.from(wrappers).every(wrapper => wrapper.classList.contains("flipped"));
}

/**
 * Updates the right-side drawer displaying the currently unlocked secret packs.
 * This list is only shown after ALL cards in the current pull grid are flipped face-up.
 */
function updateSecretPacksDrawer() {
    const listLog = DOM.secretPacksLog;
    const countEl = DOM.secretPacksCount;
    if (!listLog) return;

    const unlockedKeys = Object.keys(SECRET_PACKS).filter(key => isSecretPackUnlocked(key));
    if (countEl) {
        countEl.textContent = `${unlockedKeys.length} pack${unlockedKeys.length !== 1 ? 's' : ''}`;
    }

    // Toggle active drawer CSS state on the workspace body to accommodate side-shelf layouts
    if (sessionStats.packsOpened > 0) {
        DOM.workspace.classList.add("drawer-active");
    } else {
        DOM.workspace.classList.remove("drawer-active");
        listLog.innerHTML = `<div class="log-empty">No packs opened yet.</div>`;
        return;
    }

    // Displays lock state if there are still unflipped cards on the screen
    if (!areAllCardsOpened()) {
        listLog.innerHTML = `
            <div class="log-empty locked-packs" style="padding: 20px 10px;">
                <div style="font-size: 28px; margin-bottom: 12px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.1));">🔒</div>
                <div style="font-weight: 600; color: var(--text-light); margin-bottom: 6px; font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 0.05em;">PACKS LOCKED</div>
                <div style="font-size: 10.5px; color: var(--text-muted); line-height: 1.4;">Reveal all cards in the current pull to view unlocked Secret Packs.</div>
            </div>
        `;
        return;
    }

    // Displays empty state if all cards are flipped but no secret packs are unlocked
    if (unlockedKeys.length === 0) {
        listLog.innerHTML = `
            <div class="log-empty" style="padding: 20px 10px;">
                <div style="font-size: 28px; margin-bottom: 12px;">✨</div>
                <div style="font-weight: 600; color: var(--text-light); margin-bottom: 6px; font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 0.05em;">NO PACKS UNLOCKED</div>
                <div style="font-size: 10.5px; color: var(--text-muted); line-height: 1.4;">Pull SR or UR cards matching featured archetypes to unlock Secret Packs!</div>
            </div>
        `;
        return;
    }

    // Renders the interactive list of unlocked secret packs
    listLog.innerHTML = unlockedKeys.map(key => {
        const config = SECRET_PACKS[key];
        const isActive = selectedPackId === key;
        const borderStyle = isActive ? 'border: 1px solid var(--accent-gold); background: rgba(255, 207, 64, 0.05); box-shadow: 0 0 8px rgba(255, 207, 64, 0.1);' : '';
        
        const tags = config.archetypes.slice(0, 2).map(arch => 
            `<span class="pack-card-tag">${arch}</span>`
        ).join("");
        
        return `
            <div class="log-item unlocked-pack-item" data-pack-id="${key}" style="cursor: pointer; transition: all 0.2s ease; ${borderStyle} padding: 12px; margin-bottom: 10px; display: flex; align-items: flex-start; gap: 4px;">
                <div class="log-item-info" style="width: 100%; display: flex; flex-direction: column; gap: 4px;">
                    <div class="log-item-name" style="color: ${isActive ? 'var(--accent-gold)' : 'var(--text-light)'}; font-weight: bold; font-family: 'Orbitron', sans-serif; font-size: 11px; transition: color 0.2s ease;">${config.name}</div>
                    <div class="log-item-rarity-row" style="font-size: 9.5px; color: var(--text-muted); line-height: 1.3; white-space: normal;">
                        ${config.description}
                    </div>
                    <div class="pack-card-archetypes" style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                        ${tags}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Register click event listeners to allow switching packs directly from the side list
    document.querySelectorAll(".unlocked-pack-item").forEach(item => {
        item.addEventListener("click", () => {
            const packId = item.getAttribute("data-pack-id");
            selectPack(packId);
        });
    });
}

// ==========================================
// 10. Data Exporter Helpers
// ==========================================
/**
 * Translates session pulled cards into a fully formatted Yu-Gi-Oh! Deck file (.YDK) conforming to standard simulators.
 * Evaluates card type properties to automatically separate Main deck cards from Extra deck cards.
 */
function handleExportYdk() {
    if (sessionPulledCards.length === 0) return;
    
    let mainDeck = [];
    let extraDeck = [];
    
    sessionPulledCards.forEach(card => {
        const type = card.type.toLowerCase();
        // Check if card fits the Extra Deck categorization (Fusions, Synchros, XYZ, Links)
        const isExtra = type.includes("fusion") || 
                        type.includes("synchro") || 
                        type.includes("xyz") || 
                        type.includes("link");
                        
        if (isExtra) {
            extraDeck.push(card.id);
        } else {
            mainDeck.push(card.id);
        }
    });
    
    // Assemble standard YDK file text template
    let ydkString = "#created by Master Saga Pack Opener\n";
    ydkString += "#main\n" + mainDeck.join("\n") + "\n";
    ydkString += "#extra\n" + extraDeck.join("\n") + "\n";
    ydkString += "!side\n";
    
    // Construct text data blob and invoke dynamic local browser download trigger
    const blob = new Blob([ydkString], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Embed a clean ISO date string timestamp in file exports name
    const timestamp = new Date().toISOString().slice(0,10);
    link.href = url;
    link.download = `Master_Saga_Pulls_${timestamp}.ydk`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast("Downloaded .YDK file successfully!");
}

/**
 * Compiles, groups, and alphabetizes pulled cards, generating a clean text list copied to clipboard.
 * Output Format: "3x Ash Blossom & Joyous Spring"
 */
function handleExportTxt() {
    if (sessionPulledCards.length === 0) return;
    
    // Compile duplicate occurrences
    const counts = {};
    sessionPulledCards.forEach(card => {
        counts[card.name] = (counts[card.name] || 0) + 1;
    });
    
    // Sort keys alphabetically and format into text block
    const sortedList = Object.keys(counts).sort().map(name => {
        return `${counts[name]}x ${name}`;
    }).join("\n");
    
    // Attempt clipboard API write
    navigator.clipboard.writeText(sortedList).then(() => {
        showToast("Copied card list to clipboard!");
    }).catch(err => {
        console.error("Failed to copy list: ", err);
        showToast("Failed to copy clipboard list.");
    });
}

/**
 * Spawns a floating feedback toast panel.
 * @param {string} message - Message body to display in popup alert.
 */
function showToast(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.remove("hidden");
    
    // Dismiss overlay elements after 2.5 seconds
    setTimeout(() => {
        DOM.toast.classList.add("hidden");
    }, 2500);
}

// ==========================================
// 11. Reset Session State Handling
// ==========================================
/**
 * Prompts confirmation and restores application parameters, grids, and counters
 * back to post-initialization post-load empty states.
 */
function handleResetSession() {
    if (!confirm("Are you sure you want to reset your session statistics and all pulled cards? This cannot be undone.")) {
        return;
    }
    
    // Restore initial state variables
    sessionStats = {
        packsOpened: 0,
        gemsSpent: 0,
        urCount: 0,
        srCount: 0,
        rCount: 0,
        nCount: 0,
        totalCards: 0
    };
    sessionPulledCards = [];
    currentPackPulls = [];
    pityTimerActive = {};
    
    // Re-lock export utilities
    DOM.exportYdkBtn.setAttribute("disabled", "true");
    DOM.exportTxtBtn.setAttribute("disabled", "true");
    
    DOM.resultsHeader.classList.add("hidden");
    DOM.packTabs.classList.add("hidden");
    
    // Re-render baseline layout showing empty-state messages
    DOM.cardGrid.className = "card-grid empty-grid";
    DOM.cardGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🎴</div>
            <h2>No Packs Opened Yet</h2>
            <p>Select a pack type on the left and open packs to begin your Master Saga journey.</p>
        </div>
    `;
    
    // Refresh DOM visual dependencies
    updateStatsDOM();
    updatePityIndicator();
    updateSecretPacksDrawer();
    renderPackSelector();
    DOM.activeStatus.textContent = "Session reset successfully";
}

// ==========================================
// 12. App Bootstrap Event Trigger
// ==========================================
// Listen for completed DOM parsing to safe-boot initial processes
document.addEventListener("DOMContentLoaded", initializeApp);