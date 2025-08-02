// ====================================================================
//          FINAL MEAL PLANNER CODE - V5 (Your Google Sheet)
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
        // This regex handles cases where a value might contain a comma
        const columns = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(c => c ? c.trim().replace(/"/g, '') : '');
        const [recipeId, mealName, totalTime, tags, ingredientsStr] = columns;
        
        if (!recipeId) return null; // Skip empty rows

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
    }).filter(meal => meal !== null); // Filter out any empty rows that were parsed
}


function parsePriceData(csv) {
    const prices = {};
    const rows = csv.trim().split('\n').slice(1);
    rows.forEach(row => {
        const [ingredientName, price, unit] = row.split(',').map(c => c ? c.trim().replace(/"/g, '') : '');
        if (ingredientName) {
            prices[ingredientName] = { price: parseFloat(price), unit: unit };
        }
    });
    return prices;
}

document.getElementById('generate-button').addEventListener('click', onGenerateClick);

async function onGenerateClick() {
    const button = document.getElementById('generate-button');
    button.disabled = true;
    button.textContent = "🔄 Loading Recipes from Your Google Sheet...";

    try {
        [breakfastOptions, dinnerOptions, lunchMains, lunchVegSides, lunchNonVegSides, ingredientPrices] = await Promise.all([
            fetchAndParseSheet(GID.Breakfast, parseRecipeData),
            fetchAndParseSheet(GID.Dinner, parseRecipeData),
            fetchAndParseSheet(GID.Lunch_Mains, parseRecipeData),
            fetchAndParseSheet(GID.Lunch_Veg_Sides, parseRecipeData),
            fetchAndParseSheet(GID.Lunch_Non_Veg_Sides, parseRecipeData),
            fetchAndParseSheet(GID.Prices, parsePriceData)
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
    let usedBreakfastIds = []; let usedDinnerIds = [];
    daysOfWeek.forEach((day) => {
        const isNoEggDay = (day === 'Tuesday' || day === 'Friday' || day === 'Saturday');
        const isQuickDinner = (day === quickDinnerDay);
        let dinner;
        if (day === tiffinNight) {
            dinner = getMeal(availableBreakfasts, usedBreakfastIds, { isNoEggDay });
            if(dinner.id) usedBreakfastIds.push(dinner.id);
        } else {
            dinner = getMeal(availableDinners, usedDinnerIds, { isNoEggDay, isQuickDinner });
            if(dinner.id) usedDinnerIds.push(dinner.id);
        }
        const breakfast = getMeal(availableBreakfasts, usedBreakfastIds, { isNoEggDay });
        if(breakfast.id) usedBreakfastIds.push(breakfast.id);
        weeklyPlan[day] = {
            Breakfast: breakfast.meal,
            Lunch: getLunch(isNoEggDay, { availableLunchMains, availableLunchVegSides, availableLunchNonVegSides }),
            Dinner: dinner.meal
        };
    });
    if (useLeftovers && weeklyPlan['Sunday'] && weeklyPlan['Sunday'].Dinner) {
        weeklyPlan['Monday'].Lunch = { mealName: `Leftovers: ${weeklyPlan['Sunday'].Dinner.mealName}` };
        weeklyPlan['Sunday'].Dinner.isLeftoverSource = true;
    }
    displayPlan(weeklyPlan);
    const shoppingList = generateShoppingList(weeklyPlan);
    displayShoppingList(shoppingList);
}

function getMeal(mealList, usedIds, rules) {
    if(!mealList) return { meal: { mealName: "Data Error!", ingredients: [] }, id: null };
    let availableMeals = mealList.filter(meal => meal && meal.recipeId && !usedIds.includes(meal.recipeId));
    if (rules.isNoEggDay) {
        availableMeals = availableMeals.filter(meal => meal.tags && !meal.tags.includes('Contains-Egg'));
    }
    if (rules.isQuickDinner) {
        availableMeals = availableMeals.filter(meal => meal.totalTime <= 40);
    }
    if (availableMeals.length === 0) {
        // If no unique meals left, reset the list but still apply rules
        availableMeals = mealList.filter(meal => meal);
         if (rules.isNoEggDay) { availableMeals = availableMeals.filter(meal => meal.tags && !meal.tags.includes('Contains-Egg')); }
         if (rules.isQuickDinner) { availableMeals = availableMeals.filter(meal => meal.totalTime <= 40); }
         if (availableMeals.length === 0) return { meal: { mealName: "No meal found!", ingredients: [] }, id: null };
    }
    const chosenMeal = availableMeals[Math.floor(Math.random() * availableMeals.length)];
    return { meal: chosenMeal, id: chosenMeal.recipeId };
}

function getLunch(isNoEggDay, availableLists) {
    const main = availableLists.availableLunchMains[Math.floor(Math.random() * availableLists.availableLunchMains.length)];
    const vegSide = availableLists.availableLunchVegSides[Math.floor(Math.random() * availableLists.availableLunchVegSides.length)];
    let nonVegSide = null;
    if (!isNoEggDay) {
        nonVegSide = availableLists.availableLunchNonVegSides[Math.floor(Math.random() * availableLists.availableLunchNonVegSides.length)];
    }
    return { Main: main, VegSide: vegSide, NonVegSide: nonVegSide };
}

const unitConversions = { cup: { default: 200, "Atta Flour": 120, "Ragi Flour": 140, "Idli Rice": 200, "Toor Dal": 200, "Moong Dal": 200, "Chana Dal": 200, "Semolina": 150, "Millet": 180, "Dosa Batter": 240, "Grated Coconut": 80, "Mixed Veggies": 150, "Yogurt": 240 }, tbsp: { default: 15 }, tsp: { default: 5 }};
function getStandardQuantity(ingredient) { const { name, quantity, unit } = ingredient; const nonVolumeUnits = ['piece', 'clove', 'bunch', 'inch', 'slice', 'shallot']; if (nonVolumeUnits.includes(unit) || unit === 'g' || unit === 'ml') { return { quantity: quantity, unit: unit }; } const unitCategory = unitConversions[unit]; if (unitCategory) { const conversionFactor = unitCategory[name] || unitCategory.default; return { quantity: quantity * conversionFactor, unit: 'g' }; } return { quantity: quantity, unit: unit }; }

function generateShoppingList(weeklyPlan) { const shoppingList = {}; for (const day in weeklyPlan) { const dayMeals = weeklyPlan[day]; let recipesForDay = [dayMeals.Breakfast, dayMeals.Dinner]; if (dayMeals.Lunch.Main) { recipesForDay.push(dayMeals.Lunch.Main, dayMeals.Lunch.VegSide); if (dayMeals.Lunch.NonVegSide) recipesForDay.push(dayMeals.Lunch.NonVegSide); } recipesForDay.forEach(recipe => { if (!recipe || !recipe.ingredients) return; const multiplier = recipe.isLeftoverSource ? 2 : 1; recipe.ingredients.forEach(ing => { const standard = getStandardQuantity({ ...ing, quantity: ing.quantity * multiplier }); if (shoppingList[ing.name]) { shoppingList[ing.name].quantity += standard.quantity; shoppingList[ing.name].units.add(standard.unit); } else { shoppingList[ing.name] = { quantity: standard.quantity, units: new Set([standard.unit]) }; } }); }); } for (const itemName in shoppingList) { const item = shoppingList[itemName]; const priceInfo = ingredientPrices[itemName]; if (priceInfo) { const priceBaseQuantity = parseFloat(priceInfo.unit.match(/\d+/)) || 1; const cost = (item.quantity / priceBaseQuantity) * priceInfo.price; item.cost = `£${cost.toFixed(2)}`; } else { item.cost = '£?.??'; } } return shoppingList; }

function displayPlan(weeklyPlan) { const container = document.getElementById('weekly-planner-container'); container.innerHTML = ''; let html = '<table><tr><th>Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>'; for (const day in weeklyPlan) { const lunch = weeklyPlan[day].Lunch; const dinner = weeklyPlan[day].Dinner; const breakfast = weeklyPlan[day].Breakfast; if (!breakfast || !lunch || !dinner || !lunch.Main || !lunch.VegSide) continue; const lunchText = lunch.mealName ? lunch.mealName : `${lunch.Main.mealName} + ${lunch.VegSide.mealName}` + (lunch.NonVegSide ? ` + ${lunch.NonVegSide.mealName}` : ' (Veg)'); html += `<tr><td>${day}</td><td>${breakfast.mealName}</td><td>${lunchText}</td><td>${dinner.mealName}</td></tr>`; } html += '</table>'; container.innerHTML = html; }

function displayShoppingList(shoppingList) { const listElement = document.getElementById('shopping-list'); const costElement = document.getElementById('total-cost'); listElement.innerHTML = ''; let totalCost = 0; const sortedKeys = Object.keys(shoppingList).sort(); sortedKeys.forEach(key => { const item = shoppingList[key]; const li = document.createElement('li'); const unitString = Array.from(item.units).join('/'); li.textContent = `${key}: ${item.quantity.toFixed(1)} ${unitString} (Est. ${item.cost})`; listElement.appendChild(li); const costValue = parseFloat(item.cost.replace('£', '')); if (!isNaN(costValue)) totalCost += costValue; }); costElement.textContent = `Estimated Weekly Cost: £${totalCost.toFixed(2)}`; }
