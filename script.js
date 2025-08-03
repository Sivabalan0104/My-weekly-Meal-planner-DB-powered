// ====================================================================
//          FINAL MEAL PLANNER CODE - V6 (Corrected Calculation)
// ====================================================================

// SECTION 1: GOOGLE SHEETS CONFIGURATION
// Your personal IDs have been integrated below.
const SPREADSHEET_ID = "1hSODAb9qm2pR8oJCIj3vmZbCAh9pcjPSQIJ5wRZUa0g"; 
const GID = {
    Breakfast: "0",
    Dinner: "731339754",
    Lunch_Mains: "375842609",
    Lunch_Veg_Sides: "1873034946",
    Lunch_Non_Veg_Sides: "421149329",
    Prices: "1164801127",
};

// --- NO MORE EDITS NEEDED BELOW THIS LINE ---

function getSheetUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

let breakfastOptions, dinnerOptions, lunchMains, lunchVegSides, lunchNonVegSides, ingredientPrices;

async function fetchAndParseSheet(gid, parsingFunction) {
    try {
        const response = await fetch(getSheetUrl(gid));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const csvText = await response.text();
        return parsingFunction(csvText);
    } catch (error) {
        console.error(`Error fetching or parsing sheet with GID ${gid}:`, error);
        alert("Failed to load data. IMPORTANT: In your Google Sheet, go to File > Share > Share with others, and set General access to 'Anyone with the link can view'.");
        return null;
    }
}

function parseRecipeData(csv) {
    const rows = csv.trim().split('\n').slice(1);
    return rows.map(row => {
        const columns = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(c => c ? c.trim().replace(/"/g, '') : '');
        const [recipeId, mealName, totalTime, tags, ingredientsStr] = columns;
        
        if (!recipeId) return null;

        return {
            recipeId: parseInt(recipeId, 10),
            mealName: mealName,
            totalTime: parseInt(totalTime, 10),
            tags: tags ? tags.split('|').map(t => t.trim()) : [],
            ingredients: ingredientsStr ? ingredientsStr.split('|').map(ing => {
                const [name, quantity, unit] = ing.split(':');
                return { name: name ? name.trim() : '', quantity: parseFloat(quantity), unit: unit ? unit.trim() : '' };
            }) : []
        };
    }).filter(meal => meal !== null);
}

// FIXED: This function now standardizes units for correct cost calculation.
function parsePriceData(csv) {
    const prices = {};
    const rows = csv.trim().split('\n').slice(1);
    rows.forEach(row => {
        // Your price sheet may have 4 columns (Name, Price, Unit, Brand).
        const [ingredientName, price, unitStr, brand] = row.split(',').map(c => c ? c.trim().replace(/"/g, '') : '');
        
        if (ingredientName) {
            let baseQuantity = 1;
            let baseUnit = 'units';

            if (unitStr) {
                const match = unitStr.match(/([\d\.]+)/); // Find number in the unit string
                const num = match ? parseFloat(match[0]) : 1;
                
                // Standardize the price unit to a base quantity (grams, ml, or pieces)
                if (unitStr.toLowerCase().includes('kg')) {
                    baseQuantity = num * 1000;
                    baseUnit = 'g';
                } else if (unitStr.toLowerCase().includes('g')) {
                    baseQuantity = num;
                    baseUnit = 'g';
                } else if (unitStr.toLowerCase().includes('l')) {
                    baseQuantity = num * 1000;
                    baseUnit = 'ml';
                } else if (unitStr.toLowerCase().includes('ml')) {
                    baseQuantity = num;
                    baseUnit = 'ml';
                } else { // Handles "piece", "bunch", "clove", etc.
                    baseQuantity = num;
                    baseUnit = 'pieces';
                }
            }

            prices[ingredientName] = { 
                price: parseFloat(price), 
                unit: unitStr, // The original unit string, e.g., "1kg"
                brand: brand,  // Store the brand info
                priceBaseQuantity: baseQuantity, // The CRITICAL new property
                priceBaseUnit: baseUnit          // The CRITICAL new property
            };
        }
    });
    return prices;
}

document.getElementById('generate-button').addEventListener('click', onGenerateClick);

async function onGenerateClick() {
    const button = document.getElementById('generate-button');
    button.disabled = true;
    button.textContent = "⚙️ Loading Recipes from Your Google Sheet...";

    try {
        [breakfastOptions, dinnerOptions, lunchMains, lunchVegSides, lunchNonVegSides, ingredientPrices] = await Promise.all([
            fetchAndParseSheet(GID.Breakfast, parseRecipeData),
            fetchAndParseSheet(GID.Dinner, parseRecipeData),
            fetchAndParseSheet(GID.Lunch_Mains, parseRecipeData),
            fetchAndParseSheet(GID.Lunch_Veg_Sides, parseRecipeData),
            fetchAndParseSheet(GID.Lunch_Non_Veg_Sides, parseRecipeData),
            fetchAndParseSheet(GID.Prices, parsePriceData) // This now uses the corrected parsing function
        ]);
        
        if (!breakfastOptions || !dinnerOptions || !ingredientPrices) {
             throw new Error("One or more essential data sheets failed to load.");
        }
        generateWeeklyPlan();
    } catch (error) {
        console.error("Failed to generate plan:", error);
    } finally {
        button.disabled = false;
        button.textContent = "✨ Generate My Smart Week ✨";
    }
}

function generateWeeklyPlan() {
    const useLeftovers = document.getElementById('leftovers-checkbox').checked;
    const tiffinNight = document.getElementById('tiffin-night-select').value;
    const quickDinnerDay = document.getElementById('quick-day-select').value;
    const ingredientToAvoid = document.getElementById('avoid-ingredient-input').value.trim().toLowerCase();
    const filterByAvoidance = (meal) => {
        if (!ingredientToAvoid) return true;
        if (!meal.ingredients) return true;
        return !meal.ingredients.some(ing => ing.name.toLowerCase().includes(ingredientToAvoid));
    };
    const availableBreakfasts = breakfastOptions.filter(filterByAvoidance);
    const availableDinners = dinnerOptions.filter(filterByAvoidance);
    const availableLunchMains = lunchMains.filter(filterByAvoidance);
    const availableLunchVegSides = lunchVegSides.filter(filterByAvoidance);
    const availableLunchNonVegSides = lunchNonVegSides.filter(filterByAvoidance);
    const weeklyPlan = {};
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let usedBreakfastIds = new Set(); 
    let usedDinnerIds = new Set();
    daysOfWeek.forEach((day) => {
        const isNoEggDay = (day === 'Tuesday' || day === 'Friday' || day === 'Saturday');
        const isQuickDinner = (day === quickDinnerDay);
        let dinner;
        if (day === tiffinNight) {
            dinner = getMeal(availableBreakfasts, usedDinnerIds, { isNoEggDay });
            if(dinner.id) usedDinnerIds.add(dinner.id);
        
