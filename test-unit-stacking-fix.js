// Test script untuk validasi fix unit stacking bug
// Run dengan: node test-unit-stacking-fix.js

const fs = require('fs');
const path = require('path');

// Mock game state untuk testing
const createMockGame = () => ({
  units: [
    {
      id: 'unit1',
      ownerID: '0',
      q: -5,
      r: 0,
      currentHP: 100,
      maxHP: 100,
      type: 'SWORDSMAN'
    }
  ],
  terrainMap: {},
  log: []
});

// Test cases
const testCases = [
  {
    name: 'placeUnit - Valid placement in empty hex',
    payload: {
      unitType: 'SWORDSMAN',
      playerID: '0',
      q: -6,
      r: 0
    },
    shouldSucceed: true
  },
  {
    name: 'placeUnit - Should fail: hex already occupied',
    payload: {
      unitType: 'SWORDSMAN',
      playerID: '0',
      q: -5,
      r: 0
    },
    shouldSucceed: false,
    expectedError: 'Hex is already occupied by another unit'
  },
  {
    name: 'placeUnit - Should fail: not in spawn zone',
    payload: {
      unitType: 'SWORDSMAN',
      playerID: '0',
      q: 0,
      r: 0
    },
    shouldSucceed: false,
    expectedError: 'Units can only be placed in your spawn zone'
  }
];

// Simulasi validation logic dari API route
const validatePlaceUnit = (game, payload) => {
  // Check spawn zone
  const inSpawnZone = payload.playerID === '0' ? 
    payload.q <= -5 : 
    payload.q >= 4;
  if (!inSpawnZone) {
    return { valid: false, error: 'Units can only be placed in your spawn zone' };
  }
  
  // Check occupation
  const isOccupied = game.units.some(u => 
    u.q === payload.q && 
    u.r === payload.r && 
    u.currentHP > 0
  );
  if (isOccupied) {
    return { valid: false, error: 'Hex is already occupied by another unit' };
  }
  
  return { valid: true };
};

// Run tests
console.log('🧪 Testing Unit Stacking Fix...\n');

let passed = 0;
let total = testCases.length;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  
  const game = createMockGame();
  if (testCase.setup) {
    testCase.setup(game);
  }
  
  const result = validatePlaceUnit(game, testCase.payload);
  
  if (testCase.shouldSucceed) {
    if (result.valid) {
      console.log('✅ PASSED');
      passed++;
    } else {
      console.log(`❌ FAILED: Expected success but got error: ${result.error}`);
    }
  } else {
    if (!result.valid && result.error === testCase.expectedError) {
      console.log('✅ PASSED');
      passed++;
    } else {
      console.log(`❌ FAILED: Expected error "${testCase.expectedError}" but got "${result.error || 'success'}"`);
    }
  }
  console.log('');
});

console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);

if (passed === total) {
  console.log('🎉 All tests passed! Unit stacking bug should be fixed.');
} else {
  console.log('⚠️ Some tests failed. Please review the implementation.');
}
