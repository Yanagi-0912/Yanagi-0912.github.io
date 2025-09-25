document.addEventListener('DOMContentLoaded', () => {
    const listsContainer = document.getElementById('lists-container');
    const addListBtn = document.getElementById('add-list-btn');
    const newListInput = document.getElementById('new-list-name');

    let lists = JSON.parse(localStorage.getItem('countingLists')) || [];

    const saveLists = () => {
        localStorage.setItem('countingLists', JSON.stringify(lists));
    };

    const createListElement = (list) => {
        const listCard = document.createElement('div');
        listCard.className = 'list-card';
        listCard.dataset.listId = list.id;

        listCard.innerHTML = `
            <div class="list-header">
                <h2>${list.name}</h2>
                <button class="delete-list-btn" title="刪除清單">✖</button>
            </div>
            <div class="add-item-form">
                <input type="text" class="new-item-name" placeholder="新增項目...">
                <button class="add-item-btn">新增</button>
            </div>
            <ul class="list-items">
            </ul>
        `;

        renderItems(listCard.querySelector('.list-items'), list.items);

        return listCard;
    };
    
    const renderItems = (listItemsContainer, items) => {
        items.forEach(item => {
            const listItem = createItemElement(item);
            listItemsContainer.appendChild(listItem);
        });
    };

    const createItemElement = (item) => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.dataset.itemId = item.id;
        li.innerHTML = `
            <button class="count-btn minus-btn">-</button>
            <span class="item-name">${item.name}</span>
            <span class="item-count">${item.count}</span>
            <button class="count-btn plus-btn">+</button>
        `;
        return li;
    };

    const sortAndAnimate = (listId) => {
        const listCard = document.querySelector(`.list-card[data-list-id="${listId}"]`);
        if (!listCard) return;
        const listItemsContainer = listCard.querySelector('.list-items');
        
        const list = lists.find(l => l.id === listId);
        if (!list) return;

        // 1. 取得目前所有項目的位置 (First)
        const itemElements = [...listItemsContainer.querySelectorAll('.list-item')];
        const oldPositions = itemElements.map(el => ({ el, rect: el.getBoundingClientRect() }));
        
        // 2. 排序資料並在 DOM 中重新排序 (Last)
        list.items.sort((a, b) => b.count - a.count);
        saveLists();
        
        // 將 DOM 元素依照新的資料順序排列
        list.items.forEach(itemData => {
            const itemEl = listItemsContainer.querySelector(`.list-item[data-item-id="${itemData.id}"]`);
            listItemsContainer.appendChild(itemEl);
        });
        
        // 3. 計算位移並反向移動 (Invert)
        oldPositions.forEach(({ el, rect }) => {
            const newRect = el.getBoundingClientRect();
            const dx = rect.left - newRect.left;
            const dy = rect.top - newRect.top;
            
            if (dx !== 0 || dy !== 0) {
                el.style.transform = `translate(${dx}px, ${dy}px)`;
                el.style.transition = 'transform 0s'; // 立即套用，不要有動畫
            }
        });

        // 4. 播放動畫 (Play)
        requestAnimationFrame(() => {
            itemElements.forEach(el => {
                el.style.transform = '';
                el.style.transition = 'transform 0.4s ease-in-out';
            });
        });
    };
    
    const renderAllLists = () => {
        listsContainer.innerHTML = '';
        lists.forEach(list => {
            const listElement = createListElement(list);
            listsContainer.appendChild(listElement);
        });
    };

    addListBtn.addEventListener('click', () => {
        const listName = newListInput.value.trim();
        if (listName) {
            const newList = {
                id: `list-${Date.now()}`,
                name: listName,
                items: []
            };
            lists.push(newList);
            saveLists();
            const listElement = createListElement(newList);
            listsContainer.appendChild(listElement);
            newListInput.value = '';
        }
    });
    
    newListInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addListBtn.click();
        }
    });

    listsContainer.addEventListener('click', (e) => {
        const target = e.target;
        const listCard = target.closest('.list-card');
        if (!listCard) return;
        
        const listId = listCard.dataset.listId;
        const list = lists.find(l => l.id === listId);

        // 新增項目
        if (target.classList.contains('add-item-btn')) {
            const input = listCard.querySelector('.new-item-name');
            const itemName = input.value.trim();
            if (itemName) {
                const newItem = {
                    id: `item-${Date.now()}`,
                    name: itemName,
                    count: 0
                };
                list.items.push(newItem);
                const listItemsContainer = listCard.querySelector('.list-items');
                const itemElement = createItemElement(newItem);
                listItemsContainer.appendChild(itemElement);
                input.value = '';
                sortAndAnimate(listId);
            }
        }
        
        // 刪除清單
        if (target.classList.contains('delete-list-btn')) {
            if (confirm(`確定要刪除清單「${list.name}」嗎？`)) {
                lists = lists.filter(l => l.id !== listId);
                saveLists();
                listCard.remove();
            }
        }

        const listItem = target.closest('.list-item');
        if (!listItem) return;

        const itemId = listItem.dataset.itemId;
        const item = list.items.find(i => i.id === itemId);

        // 增減計數
        if (target.classList.contains('plus-btn')) {
            item.count++;
        } else if (target.classList.contains('minus-btn')) {
            item.count--;
        }
        
        if (target.classList.contains('plus-btn') || target.classList.contains('minus-btn')) {
            listItem.querySelector('.item-count').textContent = item.count;
            sortAndAnimate(listId);
        }
    });
    
    // 編輯項目名稱
    listsContainer.addEventListener('click', (e) => {
        if (!e.target.classList.contains('item-name')) return;
        
        const nameSpan = e.target;
        const listItem = nameSpan.closest('.list-item');
        const listCard = nameSpan.closest('.list-card');
        const listId = listCard.dataset.listId;
        const itemId = listItem.dataset.itemId;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'item-edit-input';
        input.value = nameSpan.textContent;
        
        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        const saveChanges = () => {
            const newName = input.value.trim();
            const list = lists.find(l => l.id === listId);
            const item = list.items.find(i => i.id === itemId);

            if (newName && item) {
                item.name = newName;
                nameSpan.textContent = newName;
            }
            input.replaceWith(nameSpan);
            saveLists();
        };

        input.addEventListener('blur', saveChanges);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });
    });

    renderAllLists();
});

