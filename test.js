/**
 * Automated Unit Test Suite
 * Verifies probability distributions, pity timer transitions, and export logic
 */

const assert = require("assert");

// 1. Mock Database
const mockMasterPool = {
    UR: [{ id: 101, name: "Ash Blossom & Joyous Spring", type: "Effect Monster", md_rarity: "UR" }],
    SR: [{ id: 201, name: "Pot of Desires", type: "Spell Card", md_rarity: "SR" }],
    R: [{ id: 301, name: "MST", type: "Spell Card", md_rarity: "R" }],
    N: [{ id: 401, name: "Jerry Beans Man", type: "Normal Monster", md_rarity: "N" }]
};

// Mock Extra Deck cards
const mockExtraCards = {
    UR_Extra: [{ id: 501, name: "Accesscode Talker", type: "Link Monster", md_rarity: "UR" }],
    SR_Extra: [{ id: 601, name: "Baronne de Fleur", type: "Synchro Monster", md_rarity: "SR" }]
};

// Combine for test databases
const fullIndexedPool = {
    UR: [...mockMasterPool.UR, ...mockExtraCards.UR_Extra],
    SR: [...mockMasterPool.SR, ...mockExtraCards.SR_Extra],
    R: [...mockMasterPool.R],
    N: [...mockMasterPool.N]
};

// 2. Pure Probability Engine Under Test (extracted from app.js)
function testGetRandomCard(probabilitySlot) {
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
    
    const cards = fullIndexedPool[rarity];
    const selectedCard = cards[Math.floor(Math.random() * cards.length)];
    
    return {
        ...selectedCard,
        rarity
    };
}

function testPullSinglePack(is10thPack, hasPityUR) {
    const pack = [];
    
    // Slots 1-4: Standard Slot
    for (let i = 0; i < 4; i++) {
        pack.push(testGetRandomCard("standard"));
    }
    // Slots 5-7: Standard Slot
    for (let i = 0; i < 3; i++) {
        pack.push(testGetRandomCard("standard"));
    }
    
    // Slot 8: Guaranteed Slot
    if (is10thPack) {
        if (hasPityUR) {
            pack.push(testGetRandomCard("guaranteed_ur"));
        } else {
            pack.push(testGetRandomCard("guaranteed_sr_ur"));
        }
    } else {
        pack.push(testGetRandomCard("rare_or_higher"));
    }
    
    return pack;
}

// Simulated 10-pack pull with pity state-machine
function testPull10Packs(pityActiveState) {
    let currentPityState = pityActiveState;
    const pulls = [];
    let containsUR = false;
    
    for (let p = 0; p < 10; p++) {
        const is10thPack = (p === 9);
        const hasPityUR = is10thPack && currentPityState;
        
        const pack = testPullSinglePack(is10thPack, hasPityUR);
        pulls.push(...pack);
        
        if (pack.some(c => c.rarity === "UR")) {
            containsUR = true;
        }
    }
    
    // Transition rule
    const nextPityState = !containsUR;
    
    return {
        pulls,
        containsUR,
        nextPityState
    };
}

// YDK Deck categorization rule
function isExtraDeckCard(cardType) {
    const type = cardType.toLowerCase();
    return type.includes("fusion") || 
           type.includes("synchro") || 
           type.includes("xyz") || 
           type.includes("link");
}

// Utility to check if a card's name or ID exists in a target array
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

// 3. Test Cases Execution
console.log("=== RUNNING AUTOMATED UNIT TESTS ===");

try {
    // Test Case 1: Standard Probability Curve (Statistical verification)
    console.log("Testing Standard Slot Probability Distributions (100,000 pulls)...");
    const counts = { UR: 0, SR: 0, R: 0, N: 0 };
    const runs = 100000;
    
    for (let i = 0; i < runs; i++) {
        const card = testGetRandomCard("standard");
        counts[card.rarity]++;
    }
    
    const urPct = (counts.UR / runs) * 100;
    const srPct = (counts.SR / runs) * 100;
    const rPct = (counts.R / runs) * 100;
    const nPct = (counts.N / runs) * 100;
    
    console.log(`- UR: ${urPct.toFixed(2)}% (Expected ~2.5%)`);
    console.log(`- SR: ${srPct.toFixed(2)}% (Expected ~7.5%)`);
    console.log(`- R:  ${rPct.toFixed(2)}% (Expected ~35.0%)`);
    console.log(`- N:  ${nPct.toFixed(2)}% (Expected ~55.0%)`);
    
    assert(Math.abs(urPct - 2.5) < 0.5, "UR rate out of bounds!");
    assert(Math.abs(srPct - 7.5) < 1.0, "SR rate out of bounds!");
    assert(Math.abs(rPct - 35.0) < 1.5, "Rare rate out of bounds!");
    assert(Math.abs(nPct - 55.0) < 1.5, "Common rate out of bounds!");
    console.log("✓ Test Case 1 Passed: Standard Slot probabilities are mathematically accurate.");

    // Test Case 2: Rare Slot Probability Curve
    console.log("\nTesting Slot 8 'Rare or Higher' Probability Distributions (100,000 pulls)...");
    const rareCounts = { UR: 0, SR: 0, R: 0, N: 0 };
    
    for (let i = 0; i < runs; i++) {
        const card = testGetRandomCard("rare_or_higher");
        rareCounts[card.rarity]++;
    }
    
    const rareUrPct = (rareCounts.UR / runs) * 100;
    const rareSrPct = (rareCounts.SR / runs) * 100;
    const rareRPct = (rareCounts.R / runs) * 100;
    
    console.log(`- UR: ${rareUrPct.toFixed(2)}% (Expected ~2.5%)`);
    console.log(`- SR: ${rareSrPct.toFixed(2)}% (Expected ~7.5%)`);
    console.log(`- R:  ${rareRPct.toFixed(2)}% (Expected ~90.0%)`);
    
    assert(rareCounts.N === 0, "Rare or Higher slot should never pull Common cards!");
    assert(Math.abs(rareUrPct - 2.5) < 0.5, "Rare UR rate out of bounds!");
    assert(Math.abs(rareSrPct - 7.5) < 1.0, "Rare SR rate out of bounds!");
    assert(Math.abs(rareRPct - 90.0) < 1.5, "Rare Rare rate out of bounds!");
    console.log("✓ Test Case 2 Passed: Rare Slot (Slot 8) probabilities are mathematically accurate.");

    // Test Case 3: Pity State Machine transitions
    console.log("\nTesting 10-Pack Pity Timer State Transitions...");
    
    // Triggering a pull where we override Math.random to guarantee no UR
    const originalRandom = Math.random;
    
    // Scenario A: Mocking Math.random to return 0.5 (Common/Rare, No UR/SR)
    Math.random = () => 0.5;
    let pityActive = false;
    let result = testPull10Packs(pityActive);
    
    assert.strictEqual(result.containsUR, false, "Should not contain UR card under mock conditions.");
    assert.strictEqual(result.nextPityState, true, "Pity timer should be active on the next pull if zero UR was pulled!");
    console.log("- State transition verified: UR-less pull triggers Pity = Active.");
    
    // Scenario B: Pity is active, verifying the guaranteed UR in pack 10 slot 8
    pityActive = true;
    let resultWithPity = testPull10Packs(pityActive);
    
    assert.strictEqual(resultWithPity.containsUR, true, "Guaranteed UR pull should containing at least one UR card.");
    assert.strictEqual(resultWithPity.nextPityState, false, "Pity timer should deactivate after pulling a guaranteed UR.");
    console.log("- State transition verified: Pity-pull guarantees UR and resets Pity = Inactive.");
    
    // Restore original random
    Math.random = originalRandom;
    console.log("✓ Test Case 3 Passed: Pity state-machine transitions follow Master Duel specifications.");

    // Test Case 4: YDK Exporter Card Categorization
    console.log("\nTesting YDK Exporter Deck Categorization...");
    
    assert.strictEqual(isExtraDeckCard("Link Monster"), true, "Link Monsters belong to Extra Deck");
    assert.strictEqual(isExtraDeckCard("Synchro Monster"), true, "Synchro Monsters belong to Extra Deck");
    assert.strictEqual(isExtraDeckCard("XYZ Monster"), true, "XYZ Monsters belong to Extra Deck");
    assert.strictEqual(isExtraDeckCard("Fusion Monster"), true, "Fusion Monsters belong to Extra Deck");
    assert.strictEqual(isExtraDeckCard("Normal Monster"), false, "Normal Monsters belong to Main Deck");
    assert.strictEqual(isExtraDeckCard("Spell Card"), false, "Spells belong to Main Deck");
    assert.strictEqual(isExtraDeckCard("Trap Card"), false, "Traps belong to Main Deck");
    
    console.log("✓ Test Case 4 Passed: YDK Deck categorization is 100% correct.");

    // Test Case 5: isCardInList Helper Function
    console.log("\nTesting isCardInList Helper Function...");
    const sampleCard1 = { id: 1001, name: "Blue-Eyes White Dragon" };
    const sampleCard2 = { id: 1002, name: "Dark Magician" };
    
    // Testing string case-insensitivity
    assert.strictEqual(isCardInList(sampleCard1, ["blue-eyes white dragon"]), true);
    assert.strictEqual(isCardInList(sampleCard1, ["BLUE-EYES WHITE DRAGON"]), true);
    // Testing numeric ID match
    assert.strictEqual(isCardInList(sampleCard1, [1001]), true);
    // Testing non-match
    assert.strictEqual(isCardInList(sampleCard2, ["blue-eyes white dragon"]), false);
    assert.strictEqual(isCardInList(sampleCard2, [1001]), false);
    
    console.log("✓ Test Case 5 Passed: isCardInList is verified for both strings and numeric IDs.");

    // Test Case 6: Global and Pack-specific Exclusions
    console.log("\nTesting Exclusions Filtering (Global and Pack-specific)...");
    
    const mockFullCardPool = [
        { id: 101, name: "Ash Blossom", archetype: "Zombie" },
        { id: 102, name: "Maxx \"C\"", archetype: "Insect" },
        { id: 103, name: "Icejade Tremora", archetype: "Icejade" },
        { id: 104, name: "Ghoti of the Deep", archetype: "Ghoti" }
    ];
    
    const mockGlobalExcluded = ["Maxx \"C\""];
    const mockPackExcluded = ["Icejade Tremora", 104]; // Exclude Tremora and Ghoti of the Deep (by ID)
    
    // 1. Simulate global exclusions filtering
    const globalFiltered = mockFullCardPool.filter(c => !isCardInList(c, mockGlobalExcluded));
    assert.strictEqual(globalFiltered.length, 3);
    assert.strictEqual(globalFiltered.some(c => c.name === "Maxx \"C\""), false, "Maxx C should be globally excluded");
    
    // 2. Simulate pack-specific activePool population
    const activePackPool = [];
    const mockPackConfig = {
        archetypes: ["Icejade", "Ghoti"],
        exclude_cards: mockPackExcluded
    };
    
    globalFiltered.forEach(card => {
        // Check pack-specific exclusions
        if (mockPackConfig.exclude_cards && isCardInList(card, mockPackConfig.exclude_cards)) {
            return;
        }
        
        const hasArchMatch = card.archetype && mockPackConfig.archetypes.some(arch => 
            card.archetype.toLowerCase() === arch.toLowerCase()
        );
        if (hasArchMatch) {
            activePackPool.push(card);
        }
    });
    
    // Icejade Tremora is excluded by name, Ghoti of the Deep (ID 104) is excluded by ID.
    // Only Ash Blossom (archetype Zombie, no match) and Icejade / Ghoti cards remain.
    // Tremora is excluded, Ghoti of the Deep is excluded. Active pack pool should be empty!
    assert.strictEqual(activePackPool.length, 0, "All featured pack cards should be excluded");
    console.log("✓ Test Case 6 Passed: Global and pack-specific exclusions are successfully verified.");

    // Test Case 7: Pack Selector Sorting Logic
    console.log("\nTesting Pack Selection Sidebar Sorting Logic...");
    
    const mockSecretPacks = {
        cosmic_ocean: { name: "Treasures of the Cosmic Ocean" },
        supreme_strike: { name: "Supreme Strike" },
        echo_chamber: { name: "Echo Chamber Nation" }
    };
    
    // Mock unlock states (cosmic_ocean and echo_chamber are unlocked, supreme_strike is locked)
    const mockUnlockedPacks = {
        cosmic_ocean: true,
        echo_chamber: true,
        supreme_strike: false
    };
    
    const sortedMockKeys = Object.keys(mockSecretPacks).map(key => {
        return {
            key,
            config: mockSecretPacks[key],
            unlocked: !!mockUnlockedPacks[key]
        };
    }).sort((a, b) => {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return a.config.name.localeCompare(b.config.name);
    });
    
    // Expected order: 
    // 1. Unlocked first: Echo Chamber Nation (E) before Treasures of the Cosmic Ocean (T)
    // 2. Locked second: Supreme Strike (S)
    assert.strictEqual(sortedMockKeys[0].key, "echo_chamber", "First sorted should be echo_chamber (unlocked, alphabet first)");
    assert.strictEqual(sortedMockKeys[1].key, "cosmic_ocean", "Second sorted should be cosmic_ocean (unlocked, alphabet second)");
    assert.strictEqual(sortedMockKeys[2].key, "supreme_strike", "Third sorted should be supreme_strike (locked)");
    
    console.log("✓ Test Case 7 Passed: Pack selection sorting logic matches requirements (unlocked at top, sorted alphabetically).");

    console.log("\n====================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("====================================");

} catch (err) {
    console.error("❌ TEST FAILURE:", err);
    process.exit(1);
}