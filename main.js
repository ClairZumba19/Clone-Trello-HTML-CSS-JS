(function () {
    "use strict";

    /* ====================================================================
       SELETORES
       Centralizamos todas as referências ao DOM aqui em cima. Assim,
       se um id mudar no HTML, só precisamos atualizar em um lugar.
       ==================================================================== */
    const boardEl = document.getElementById("board");
    const addListBtn = document.getElementById("add-list-btn");
    const listTemplate = document.getElementById("list-template");
    const cardTemplate = document.getElementById("card-template");

    const cardModal = document.getElementById("card-modal");
    const cardForm = document.getElementById("card-form");
    const cardModalTitle = document.getElementById("card-modal-title");
    const cardTitleInput = document.getElementById("card-title-input");
    const cardDescInput = document.getElementById("card-desc-input");
    const cardDateInput = document.getElementById("card-date-input");
    const cardModalClose = document.getElementById("card-modal-close");
    const cardModalCancel = document.getElementById("card-modal-cancel");

    /* ====================================================================
       ESTADO DA APLICAÇÃO
       "state.board" é a ÚNICA fonte de verdade. Toda a interface é uma
       função desse array: mudou o estado -> re-renderiza (total ou
       parcialmente) -> a tela reflete o novo estado.
       ==================================================================== */
    const STORAGE_KEY = "taskflow-board-v1";

    const state = {
      board: [],          // Array de listas (colunas do quadro)
      cardModalMode: null, // "add" | "edit" | null
      cardModalListId: null,
      cardModalCardId: null,
    };

    // Variáveis auxiliares usadas apenas durante uma operação de
    // arrastar-e-soltar (Drag and Drop). Ficam fora de "state" porque
    // são efêmeras e não precisam ser salvas nem re-renderizadas.
    let dragType = null;     // "card" | "list"
    let dragCardOriginListId = null;

    /* ====================================================================
       PERSISTÊNCIA (LOCALSTORAGE)
       ==================================================================== */

    // Dados iniciais mostrados na primeira visita (quando ainda não existe
    // nada salvo no localStorage). Servem também de exemplo de uso da API.
    function getSeedData() {
      return [
        {
          id: generateId(),
          title: "A Fazer",
          cards: [
            {
              id: generateId(),
              title: "Estudar Event Delegation",
              description: "Entender por que um único listener no pai é melhor que vários listeners nos filhos.",
              date: "",
            },
            {
              id: generateId(),
              title: "Configurar ambiente",
              description: "Abrir este arquivo no navegador e explorar o DevTools.",
              date: "",
            },
          ],
        },
        {
          id: generateId(),
          title: "Em Progresso",
          cards: [
            {
              id: generateId(),
              title: "Implementar Drag and Drop",
              description: "Usar dragstart, dragover, drop e dragend.",
              date: "",
            },
          ],
        },
        {
          id: generateId(),
          title: "Concluído",
          cards: [
            {
              id: generateId(),
              title: "Criar estrutura HTML",
              description: "Cabeçalho, quadro e templates prontos.",
              date: "",
            },
          ],
        },
      ];
    }

    // Lê o quadro salvo no localStorage. Se não existir (primeiro acesso)
    // ou se o dado estiver corrompido, cai de volta para os dados de exemplo.
    function loadBoard() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (error) {
        console.warn("Não foi possível ler o localStorage. Usando dados iniciais.", error);
      }
      return getSeedData();
    }

    // Grava o estado atual do quadro no localStorage. Chamada sempre que
    // uma função de dados (CRUD) altera "state.board".
    function saveBoard() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.board));
      } catch (error) {
        console.warn("Não foi possível salvar no localStorage.", error);
      }
    }

    /* ====================================================================
       FUNÇÕES UTILITÁRIAS
       ==================================================================== */

    // Gera um id simples e praticamente único combinando o timestamp atual
    // (base 36) com um trecho aleatório. Suficiente para um projeto de
    // estudo que roda em um único navegador.
    function generateId() {
      return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    // Converte "2026-07-20" (formato do <input type="date">) para "20/07/2026",
    // que é mais natural de ler na interface.
    function formatDate(isoDate) {
      const [year, month, day] = isoDate.split("-");
      return `${day}/${month}/${year}`;
    }

    // Procura uma lista pelo id. Usa o método find(), que devolve o
    // primeiro elemento do array que satisfaz a condição (ou undefined).
    function findList(listId) {
      return state.board.find((list) => list.id === listId);
    }

    // Procura um cartão em QUALQUER lista, devolvendo tanto o cartão
    // quanto a lista onde ele está. Precisamos disso porque, depois de um
    // Drag and Drop, um cartão pode ter mudado de lista.
    function findCardAnywhere(cardId) {
      for (const list of state.board) {
        const card = list.cards.find((c) => c.id === cardId);
        if (card) {
          return { card, list };
        }
      }
      return { card: null, list: null };
    }

    // Retorna uma das 6 classes de cor cíclicas (list--c0 ... list--c5)
    // com base na posição da lista no quadro. Usamos o resto da divisão
    // (módulo) para "dar a volta" na paleta quando há mais de 6 listas.
    function getAccentClass(index) {
      return "list--c" + (index % 6);
    }

    /* ====================================================================
       RENDERIZAÇÃO
       Estas funções transformam "state.board" em elementos reais na
       tela. Elas nunca modificam o estado — apenas leem.
       ==================================================================== */

    // Recria o quadro inteiro do zero. É usada só em operações estruturais
    // grandes (carregar a página, apagar uma lista inteira etc.). Para
    // ações pontuais (adicionar 1 cartão, editar 1 título) preferimos
    // manipular apenas o nó necessário — é mais rápido e didático.
    function renderBoard() {
      boardEl.innerHTML = "";

      const fragment = document.createDocumentFragment();
      state.board.forEach((list, index) => {
        fragment.append(createListElement(list, index));
      });

      // append() aceita nós e/ou texto e insere no final do elemento.
      // Inserir um DocumentFragment de uma vez só evita múltiplos
      // "reflows" no navegador (melhor performance que um append por lista).
      boardEl.append(fragment);
    }

    // Constrói o elemento DOM de UMA lista a partir do <template>.
    function createListElement(list, index) {
      // template.content é um DocumentFragment "modelo"; cloneNode(true)
      // faz uma cópia profunda dele (incluindo todos os filhos), sem
      // afetar o template original — podemos cloná-lo quantas vezes quisermos.
      const clone = listTemplate.content.cloneNode(true);
      const listEl = clone.querySelector(".list");

      // dataset lê/escreve atributos "data-*". Aqui guardamos o id da
      // lista diretamente no elemento, para recuperá-lo depois em
      // qualquer handler de evento (ex.: e.target.closest(".list").dataset.id).
      listEl.dataset.id = list.id;
      listEl.classList.add(getAccentClass(index));

      listEl.querySelector(".list__title").textContent = list.title;
      listEl.querySelector(".list__count").textContent = String(list.cards.length).padStart(2, "0");

      const cardsContainer = listEl.querySelector(".list__cards");
      list.cards.forEach((card) => {
        cardsContainer.append(createCardElement(card));
      });

      return listEl;
    }

    // Constrói o elemento DOM de UM cartão a partir do <template>.
    function createCardElement(card) {
      const clone = cardTemplate.content.cloneNode(true);
      const cardEl = clone.querySelector(".card");

      cardEl.dataset.id = card.id;
      cardEl.querySelector(".card__title").textContent = card.title;

      const descEl = cardEl.querySelector(".card__description");
      if (card.description) {
        descEl.textContent = card.description;
      } else {
        // remove() tira o nó do DOM. Preferimos remover o parágrafo vazio
        // a deixá-lo lá exibindo nada — menos elementos supérfluos na árvore.
        descEl.remove();
      }

      if (card.date) {
        const dateBadge = document.createElement("span");
        dateBadge.className = "card__date";
        dateBadge.textContent = formatDate(card.date);
        // prepend() insere o elemento como o PRIMEIRO filho do cartão,
        // antes de tudo que já existe — é assim que o "selo" de data
        // aparece no topo do cartão, ainda que o HTML do template
        // não o preveja em nenhuma posição fixa.
        cardEl.prepend(dateBadge);
      }

      return cardEl;
    }

    // Atualiza apenas o "carimbo numérico" de contagem de cartões de uma
    // lista (sem re-renderizar a lista inteira). Chamada sempre que o
    // número de cartões de uma lista muda: adicionar, excluir, duplicar
    // ou mover um cartão via Drag and Drop.
    function updateListCount(listId) {
      const list = findList(listId);
      const countEl = boardEl.querySelector(`.list[data-id="${listId}"] .list__count`);
      if (list && countEl) {
        countEl.textContent = String(list.cards.length).padStart(2, "0");
      }
    }

    /* ====================================================================
       FUNÇÕES DE DADOS (CRUD sobre state.board)
       Cada função altera o array de estado, salva no localStorage e faz
       a MENOR atualização de DOM necessária (em vez de sempre chamar
       renderBoard(), o que seria mais simples porém mais custoso).
       ==================================================================== */

    // --- LISTAS ---------------------------------------------------------

    function addList(title) {
      const newList = { id: generateId(), title: title.trim(), cards: [] };
      state.board.push(newList);
      saveBoard();

      const index = state.board.length - 1;
      boardEl.append(createListElement(newList, index));
      return newList;
    }

    function renameList(listId, newTitle) {
      const list = findList(listId);
      if (!list) return;
      list.title = newTitle.trim() || list.title;
      saveBoard();
    }

    function deleteList(listId) {
      const listEl = boardEl.querySelector(`.list[data-id="${listId}"]`);
      state.board = state.board.filter((list) => list.id !== listId);
      saveBoard();

      if (listEl) {
        // Uma pequena transição de saída antes de remover de fato,
        // usando a classe CSS ".card--removing" (reaproveitada aqui via
        // uma transição equivalente definida em .list através de opacity).
        listEl.style.transition = "opacity 150ms ease, transform 150ms ease";
        listEl.style.opacity = "0";
        listEl.style.transform = "scale(0.96)";
        listEl.addEventListener(
          "transitionend",
          () => listEl.remove(), // remove() tira o elemento do DOM
          { once: true }
        );
      }

      // Reatribui as classes de cor (list--c0..5) porque a posição de
      // cada lista pode ter mudado depois da exclusão.
      refreshAccentClasses();
    }

    // Depois de reordenar/excluir listas, a "cor" de cada uma (que é
    // baseada na posição) pode estar desatualizada. Esta função apenas
    // corrige as classes, sem tocar em mais nada.
    function refreshAccentClasses() {
      const listEls = [...boardEl.querySelectorAll(".list")];
      listEls.forEach((el, index) => {
        el.classList.remove("list--c0", "list--c1", "list--c2", "list--c3", "list--c4", "list--c5");
        el.classList.add(getAccentClass(index));
      });
    }

    // --- CARTÕES ---------------------------------------------------------

    function addCard(listId, data) {
      const list = findList(listId);
      if (!list) return;

      const newCard = {
        id: generateId(),
        title: data.title.trim(),
        description: data.description.trim(),
        date: data.date || "",
      };
      list.cards.push(newCard);
      saveBoard();

      const cardsContainer = boardEl.querySelector(`.list[data-id="${listId}"] .list__cards`);
      if (cardsContainer) {
        cardsContainer.append(createCardElement(newCard));
      }
      updateListCount(listId);
    }

    function editCard(cardId, data) {
      const { card } = findCardAnywhere(cardId);
      if (!card) return;

      card.title = data.title.trim();
      card.description = data.description.trim();
      card.date = data.date || "";
      saveBoard();

      // Em vez de re-renderizar a lista inteira, trocamos o cartão
      // existente por uma nova versão dele — bom pretexto para usar
      // replaceWith().
      const oldCardEl = boardEl.querySelector(`.card[data-id="${cardId}"]`);
      if (oldCardEl) {
        const newCardEl = createCardElement(card);
        oldCardEl.replaceWith(newCardEl);
      }
    }

    function deleteCard(cardId, listId) {
      const list = findList(listId);
      if (!list) return;

      list.cards = list.cards.filter((c) => c.id !== cardId);
      saveBoard();

      const cardEl = boardEl.querySelector(`.card[data-id="${cardId}"]`);
      if (cardEl) {
        cardEl.classList.add("card--removing");
        cardEl.addEventListener("transitionend", () => cardEl.remove(), { once: true });
      }
      updateListCount(listId);
    }

    function duplicateCard(cardId, listId) {
      const list = findList(listId);
      if (!list) return;

      const originalIndex = list.cards.findIndex((c) => c.id === cardId);
      if (originalIndex === -1) return;

      const original = list.cards[originalIndex];
      const copy = {
        id: generateId(),
        title: original.title + " (cópia)",
        description: original.description,
        date: original.date,
      };

      // spread (...) cria um novo array com a cópia inserida logo após
      // o cartão original, sem mutar o array original diretamente.
      list.cards = [
        ...list.cards.slice(0, originalIndex + 1),
        copy,
        ...list.cards.slice(originalIndex + 1),
      ];
      saveBoard();

      const originalEl = boardEl.querySelector(`.card[data-id="${cardId}"]`);
      if (originalEl) {
        // cloneNode(true) copia o cartão original (com toda a sua
        // estrutura interna) sem precisarmos reconstruir o HTML do zero.
        const clonedEl = originalEl.cloneNode(true);
        clonedEl.dataset.id = copy.id;
        clonedEl.querySelector(".card__title").textContent = copy.title;

        // Detalhe importante: NÃO precisamos "reanexar" cliques nem
        // eventos de drag ao clonedEl. Como todos os eventos do quadro
        // usam delegação de eventos (um único listener lá no #board),
        // o clone já funciona normalmente assim que entra no DOM.
        originalEl.after(clonedEl);
      }
      updateListCount(listId);
    }

    /* ====================================================================
       DRAG AND DROP
       Estratégia usada: durante o "dragover", já vamos movendo o
       elemento arrastado dentro do DOM (usando insertBefore/append) para
       dar feedback visual imediato. Quando o "drop" acontece, lemos a
       ordem final dos elementos na tela e reconstruímos state.board a
       partir dela (sincronizamos o estado a partir do DOM).
       ==================================================================== */

    // Descobre, dentro de um contêiner, qual é o elemento logo ABAIXO
    // (ou à direita, se horizontal) da posição do cursor. Isso é o que
    // permite soltar um item "entre" dois outros já existentes.
    function getElementAfterPosition(container, position, selector, horizontal) {
      const elements = [...container.querySelectorAll(selector)].filter(
        (el) => !el.classList.contains("dragging")
      );

      return elements.reduce(
        (closest, el) => {
          const box = el.getBoundingClientRect();
          const offset = horizontal
            ? position - (box.left + box.width / 2)
            : position - (box.top + box.height / 2);

          if (offset < 0 && offset > closest.offset) {
            return { offset, element: el };
          }
          return closest;
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
      ).element;
    }

    function handleDragStart(event) {
      const cardEl = event.target.closest(".card");
      const listHeaderClick = event.target.closest(".list__header");

      if (cardEl) {
        dragType = "card";
        dragCardOriginListId = cardEl.closest(".list").dataset.id;
        // classList.add() marca visualmente o elemento sendo arrastado
        // (aplicamos opacity reduzida via CSS na classe ".dragging").
        cardEl.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        return;
      }

      const listEl = event.target.closest(".list");
      if (listEl && listHeaderClick) {
        dragType = "list";
        listEl.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
      }
    }

    function handleDragOver(event) {
      if (!dragType) return;
      // preventDefault() é obrigatório no dragover: por padrão o
      // navegador NÃO permite soltar (drop) em nenhum elemento. Ao
      // chamar preventDefault(), avisamos que este contêiner aceita
      // receber o item arrastado.
      event.preventDefault();

      if (dragType === "card") {
        const cardsContainer = event.target.closest(".list__cards");
        if (!cardsContainer) return;

        const draggingEl = boardEl.querySelector(".card.dragging");
        if (!draggingEl) return;

        const afterEl = getElementAfterPosition(cardsContainer, event.clientY, ".card", false);
        if (afterEl == null) {
          cardsContainer.append(draggingEl);
        } else {
          cardsContainer.insertBefore(draggingEl, afterEl);
        }

        cardsContainer.closest(".list").classList.add("drag-over");
      } else if (dragType === "list") {
        const draggingEl = boardEl.querySelector(".list.dragging");
        if (!draggingEl) return;

        const afterEl = getElementAfterPosition(boardEl, event.clientX, ".list", true);
        if (afterEl == null) {
          boardEl.append(draggingEl);
        } else {
          boardEl.insertBefore(draggingEl, afterEl);
        }
      }
    }

    function handleDragLeave(event) {
      const listEl = event.target.closest(".list");
      if (listEl) {
        listEl.classList.remove("drag-over");
      }
    }

    function handleDrop(event) {
      event.preventDefault();
    }

    function handleDragEnd() {
      const draggingCard = boardEl.querySelector(".card.dragging");
      const draggingList = boardEl.querySelector(".list.dragging");

      if (draggingCard) draggingCard.classList.remove("dragging");
      if (draggingList) draggingList.classList.remove("dragging");

      boardEl.querySelectorAll(".list.drag-over").forEach((el) => el.classList.remove("drag-over"));

      if (dragType) {
        // A ordem visual no DOM já reflete a posição final desejada
        // pelo usuário; agora reconstruímos state.board para que o
        // localStorage e o array em memória fiquem sincronizados com
        // o que está na tela.
        syncStateFromDom();
      }

      dragType = null;
      dragCardOriginListId = null;
    }

    // Reconstrói state.board lendo a ordem atual dos elementos .list e
    // .card diretamente do DOM (feita depois de qualquer Drag and Drop).
    function syncStateFromDom() {
      // Primeiro juntamos todos os cartões de todas as listas em um único
      // "dicionário" (Map) por id, para conseguir encontrá-los não importa
      // em qual lista eles estavam antes.
      const allCardsById = new Map();
      state.board.forEach((list) => {
        list.cards.forEach((card) => allCardsById.set(card.id, card));
      });

      const newBoard = [...boardEl.querySelectorAll(".list")].map((listEl) => {
        const list = findList(listEl.dataset.id);
        const newCards = [...listEl.querySelectorAll(".card")]
          .map((cardEl) => allCardsById.get(cardEl.dataset.id))
          .filter(Boolean);

        return { ...list, cards: newCards };
      });

      state.board = newBoard;
      refreshAccentClasses();
      state.board.forEach((list) => updateListCount(list.id));
      saveBoard();
    }

    /* ====================================================================
       EDIÇÃO DE TÍTULO DE LISTA (inline, usando replaceWith)
       ==================================================================== */
    function enableListTitleEdit(listEl) {
      const list = findList(listEl.dataset.id);
      if (!list) return;

      const titleEl = listEl.querySelector(".list__title");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "list__title-input";
      input.value = list.title;
      input.maxLength = 60;

      // replaceWith() troca o <h2> pelo <input> no mesmo lugar da árvore
      // DOM — não precisamos remover um e inserir outro manualmente.
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        renameList(list.id, input.value);

        const newTitleEl = document.createElement("h2");
        newTitleEl.className = "list__title";
        newTitleEl.textContent = list.title;

        // replaceWith() de novo, agora devolvendo o <h2> no lugar do <input>.
        input.replaceWith(newTitleEl);
      }

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          input.blur(); // dispara o "blur", que chama commit()
        } else if (event.key === "Escape") {
          input.value = list.title;
          input.blur();
        }
      });
    }

    /* ====================================================================
       COMPOSITOR DE NOVA LISTA
       ==================================================================== */
    function openListComposer() {
      const existing = document.querySelector(".list-composer");
      if (existing) {
        existing.querySelector(".list-composer__input").focus();
        return;
      }

      const composer = document.createElement("div");
      composer.className = "list-composer";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "list-composer__input";
      input.placeholder = "Nome da lista";
      input.maxLength = 60;

      const actions = document.createElement("div");
      actions.className = "list-composer__actions";

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn btn--primary";
      confirmBtn.textContent = "Adicionar lista";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "icon-btn";
      cancelBtn.textContent = "✕";
      cancelBtn.setAttribute("aria-label", "Cancelar");

      actions.append(confirmBtn, cancelBtn);
      composer.append(input, actions);
      
      boardEl.append(composer);

      input.focus();

      function confirm() {
        const title = input.value.trim();
        if (!title) {
          input.focus();
          return;
        }
        addList(title);
        input.value = "";
        input.focus();
      }

      function cancel() {
        composer.remove();
      }

      confirmBtn.addEventListener("click", confirm);
      cancelBtn.addEventListener("click", cancel);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          confirm();
        } else if (event.key === "Escape") {
          cancel();
        }
      });
    }

    /* ====================================================================
       MODAL DE CARTÃO (adicionar / editar)
       ==================================================================== */
    function openCardModal({ mode, listId, cardId }) {
      state.cardModalMode = mode;
      state.cardModalListId = listId;
      state.cardModalCardId = cardId || null;

      if (mode === "edit") {
        const { card } = findCardAnywhere(cardId);
        cardModalTitle.textContent = "Editar cartão";
        cardTitleInput.value = card.title;
        cardDescInput.value = card.description;
        cardDateInput.value = card.date || "";
      } else {
        cardModalTitle.textContent = "Novo cartão";
        cardForm.reset();
      }

      cardModal.hidden = false;
      cardTitleInput.focus();
    }

    function closeCardModal() {
      cardModal.hidden = true;
      cardForm.reset();
      state.cardModalMode = null;
      state.cardModalListId = null;
      state.cardModalCardId = null;
    }

    function handleCardFormSubmit(event) {
      event.preventDefault();

      const data = {
        title: cardTitleInput.value,
        description: cardDescInput.value,
        date: cardDateInput.value,
      };

      if (!data.title.trim()) {
        cardTitleInput.focus();
        return;
      }

      if (state.cardModalMode === "add") {
        addCard(state.cardModalListId, data);
      } else if (state.cardModalMode === "edit") {
        editCard(state.cardModalCardId, data);
      }

      closeCardModal();
    }

    /* ====================================================================
       EVENTOS
       Usamos EVENT DELEGATION: em vez de colocar um listener em cada
       botão de cada cartão (o que seria caro e complicado de manter
       conforme cartões são criados/destruídos), colocamos UM listener
       no contêiner pai (#board) e descobrimos o alvo real do clique
       com closest(). Isso também garante que cartões clonados ou
       recém-criados já funcionem automaticamente.
       ==================================================================== */

    boardEl.addEventListener("click", (event) => {
      // closest("[data-action]") sobe pela árvore a partir do elemento
      // clicado até achar o primeiro ancestral (ou ele mesmo) que tenha
      // o atributo data-action — assim funciona mesmo se o clique cair
      // num ícone/texto dentro do botão, e não no <button> em si.
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;

      const listEl = actionEl.closest(".list");
      const cardEl = actionEl.closest(".card");
      const action = actionEl.dataset.action;

      switch (action) {
        case "edit-list":
          enableListTitleEdit(listEl);
          break;

        case "delete-list": {
          const list = findList(listEl.dataset.id);
          const cardCount = list ? list.cards.length : 0;
          const message =
            cardCount > 0
              ? `Excluir a lista "${list.title}" e seus ${cardCount} cartão(ões)?`
              : `Excluir a lista "${list.title}"?`;
          if (confirm(message)) {
            deleteList(listEl.dataset.id);
          }
          break;
        }

        case "add-card":
          openCardModal({ mode: "add", listId: listEl.dataset.id });
          break;

        case "edit-card":
          openCardModal({ mode: "edit", listId: listEl.dataset.id, cardId: cardEl.dataset.id });
          break;

        case "delete-card": {
          const { card } = findCardAnywhere(cardEl.dataset.id);
          if (confirm(`Excluir o cartão "${card.title}"?`)) {
            deleteCard(cardEl.dataset.id, listEl.dataset.id);
          }
          break;
        }

        case "duplicate-card":
          duplicateCard(cardEl.dataset.id, listEl.dataset.id);
          break;
      }
    });

    // Eventos de Drag and Drop (também delegados no #board).
    boardEl.addEventListener("dragstart", handleDragStart);
    boardEl.addEventListener("dragover", handleDragOver);
    boardEl.addEventListener("dragleave", handleDragLeave);
    boardEl.addEventListener("drop", handleDrop);
    boardEl.addEventListener("dragend", handleDragEnd);

    // Botão "+ Nova lista" do cabeçalho.
    addListBtn.addEventListener("click", openListComposer);

    // Modal de cartão.
    cardForm.addEventListener("submit", handleCardFormSubmit);
    cardModalClose.addEventListener("click", closeCardModal);
    cardModalCancel.addEventListener("click", closeCardModal);

    // Fecha o modal ao clicar fora dele (no overlay escuro).
    cardModal.addEventListener("click", (event) => {
      if (event.target === cardModal) {
        closeCardModal();
      }
    });

    // Fecha o modal com a tecla Escape, e também cancela o compositor
    // de nova lista, se estiver aberto.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!cardModal.hidden) {
          closeCardModal();
        }
        const composer = document.querySelector(".list-composer");
        if (composer) {
          composer.remove();
        }
      }
    });

    /* ====================================================================
       INICIALIZAÇÃO
       ==================================================================== */
    function init() {
      state.board = loadBoard();
      renderBoard();
    }

    init();
  })();