require('dotenv').config();
const fs = require('fs');
const { TronWeb } = require('tronweb');

// Initialize TronWeb with a valid private key
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: process.env.PRIVATE_KEY_MAINNET
});

// Load the compiled contract artifact
const artifact = JSON.parse(fs.readFileSync('./build/contracts/VaultFactory.json'));
const abi = artifact.abi;
const bytecode = artifact.bytecode;

// Ensure bytecode starts without '0x'
const cleanBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;

// Method 1: Estimate using transaction simulation
async function estimateDeploymentEnergySimulation() {
  try {
    console.log('=== Method 1: Transaction Simulation ===');
    
    // Create the deployment transaction
    const tx = await tronWeb.transactionBuilder.createSmartContract({
      abi,
      bytecode: cleanBytecode,
      feeLimit: 100_000_000, // Increased fee limit
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 50_000_000 // Increased origin energy limit
    }, tronWeb.defaultAddress.base58);

    // Try to estimate energy - note this method has limitations
    try {
      const estimate = await tronWeb.transactionBuilder.estimateEnergy(tx);
      console.log('Estimated Energy (simulation):', estimate);
    } catch (estimateErr) {
      console.log('Direct estimation failed:', estimateErr.message);
      console.log('This is expected for contract deployments');
    }

    return tx;
  } catch (err) {
    console.error('Error in simulation method:', err.message);
    return null;
  }
}

// Method 2: Calculate based on bytecode size (rough estimate)
function estimateEnergyByBytecode() {
  console.log('\n=== Method 2: Bytecode-based Estimation ===');
  
  const bytecodeLength = cleanBytecode.length / 2; // Convert hex length to bytes
  console.log('Contract bytecode size:', bytecodeLength, 'bytes');
  
  // Rough estimates based on TRON energy costs:
  // - Base deployment cost: ~100,000 energy
  // - Per byte cost: ~100-200 energy per byte
  // - Constructor execution: variable, assume ~50,000-200,000
  
  const baseDeploymentCost = 100_000;
  const perByteCost = 150; // Average estimate
  const constructorEstimate = 100_000; // Conservative estimate
  
  const totalEstimate = baseDeploymentCost + (bytecodeLength * perByteCost) + constructorEstimate;
  
  console.log('Estimated breakdown:');
  console.log('- Base deployment:', baseDeploymentCost);
  console.log('- Bytecode storage:', bytecodeLength * perByteCost);
  console.log('- Constructor execution:', constructorEstimate);
  console.log('- Total estimated energy:', totalEstimate);
  
  return totalEstimate;
}

// Method 3: Use triggerConstantContract for more accurate estimation
async function estimateUsingConstantContract() {
  try {
    console.log('\n=== Method 3: Alternative Estimation ===');
    
    // This won't work directly for deployment, but shows the approach
    // for estimating function calls after deployment
    console.log('Note: triggerConstantContract cannot estimate deployment energy');
    console.log('This method would be used for function call estimation after deployment');
    
    return null;
  } catch (err) {
    console.error('Error in constant contract method:', err.message);
    return null;
  }
}

// Method 4: Calculate TRX cost based on energy estimate
function calculateTRXCost(energyEstimate) {
  console.log('\n=== TRX Cost Calculation ===');
  
  // Current TRON energy price (this can fluctuate)
  const energyPriceInSun = 420; // Sun per energy unit (approximate)
  const sunToTRX = 1_000_000; // 1 TRX = 1,000,000 SUN
  
  const totalSunCost = energyEstimate * energyPriceInSun;
  const totalTRXCost = totalSunCost / sunToTRX;
  
  console.log('Energy needed:', energyEstimate);
  console.log('Energy price:', energyPriceInSun, 'SUN per energy');
  console.log('Total cost:', totalSunCost, 'SUN');
  console.log('Total cost:', totalTRXCost.toFixed(6), 'TRX');
  
  return totalTRXCost;
}

// Main estimation function
async function estimateDeploymentEnergy() {
  try {
    console.log('Starting contract deployment energy estimation...\n');
    
    // Method 1: Try transaction simulation
    await estimateDeploymentEnergySimulation();
    
    // Method 2: Bytecode-based estimation (most reliable for planning)
    const bytecodeEstimate = estimateEnergyByBytecode();
    
    // Method 3: Show alternative approach
    await estimateUsingConstantContract();
    
    // Calculate TRX cost
    calculateTRXCost(bytecodeEstimate);
    
    console.log('\n=== Recommendations ===');
    console.log('1. Use the bytecode-based estimate for planning purposes');
    console.log('2. Set feeLimit to at least 2x the estimated energy cost');
    console.log('3. Test deployment on Shasta testnet first');
    console.log('4. Monitor actual energy consumption after deployment');
    
  } catch (err) {
    console.error('Error in main estimation function:', err.message);
  }
}

// Additional utility function to check account energy
async function checkAccountEnergy() {
  try {
    console.log('\n=== Account Energy Check ===');
    const account = await tronWeb.trx.getAccount(tronWeb.defaultAddress.base58);
    
    if (account.account_resource) {
      const energyLimit = account.account_resource.energy_limit || 0;
      const energyUsed = account.account_resource.energy_used || 0;
      const availableEnergy = energyLimit - energyUsed;
      
      console.log('Energy limit:', energyLimit);
      console.log('Energy used:', energyUsed);
      console.log('Available energy:', availableEnergy);
    } else {
      console.log('No energy resources found for account');
    }
    
    const balance = await tronWeb.trx.getBalance(tronWeb.defaultAddress.base58);
    console.log('Account TRX balance:', tronWeb.fromSun(balance), 'TRX');
    
  } catch (err) {
    console.error('Error checking account energy:', err.message);
  }
}

// Run the estimation
async function main() {
  await estimateDeploymentEnergy();
  await checkAccountEnergy();
}

main().catch(console.error);