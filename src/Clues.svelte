<script>
  import ClueList from "./ClueList.svelte";
  // import ClueBar from "./ClueBar.svelte";

  export let clues;
  export let cellIndexMap;
  export let focusedDirection;
  export let focusedCellIndex;
  export let focusedCell;
  export let stacked;
  export let isDisableHighlight;
  export let isLoaded;

  $: focusedClueNumbers = focusedCell.clueNumbers || {};
  $: currentClue =
    clues.find(
      c =>
        c.direction === focusedDirection &&
        c.number === focusedClueNumbers[focusedDirection]
    ) || {};

  function onClueFocus({ direction, id, number }) {
    console.log(focusedCell)
    console.log(focusedCellIndex)
    console.log(focusedDirection)

    // 避免当前cell被重置
    if(focusedDirection === direction && focusedCell.clueNumbers[direction] === number) {
      return
    }
    focusedDirection = direction;
    focusedCellIndex = cellIndexMap[id] || 0;
  }

  // function onNextClue({ detail }) {
  //   let next = detail;
  //   if (next < 0) next = clues.length - 1;
  //   else if (next > clues.length - 1) next = 0;
  //   const { direction, id } = clues[next];
  //   onClueFocus({ direction, id });
  // }
</script>

<!-- class:stacked -->
<section class="clues" class:is-loaded="{isLoaded}">
  <div class="clues--stacked">
    <!-- <ClueBar {currentClue} on:nextClue="{onNextClue}" /> -->
  </div>

  <div class="clues--list">
    {#each ['across', 'down'] as direction}
      <ClueList
        {direction}
        {focusedClueNumbers}
        clues="{clues.filter(d => d.direction === direction)}"
        isDirectionFocused="{focusedDirection === direction}"
        {isDisableHighlight}
        {onClueFocus} />
    {/each}
  </div>
</section>

<style>
  section {
    position: sticky;
    top: 0;
    flex: 0 1 16em;
    height: fit-content;
    margin: 0;
    margin-right: 0;



    position: absolute;
    z-index: 9;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }

  section.is-loaded.stacked {
    position: static;
    height: auto;
    top: auto;
    display: block;
    margin: 1em 0;
    flex: auto;
  }

  .clues--stacked {
    margin: 0;
    display: none;
  }

  .is-loaded.stacked .clues--stacked {
    display: block;
  }

  .is-loaded.stacked .clues--list {
    /* display: none; */
  }

  .clues {
    height: 0;
  }

  @media only screen and (max-width: 720px) {
    section:not(.is-loaded) {
      position: static;
      height: auto;
      top: auto;
      display: block;
      margin: 1em 0;
      flex: auto;
    }

    .clues--stacked:not(.is-loaded) {
      display: block;
    }

    .clues--list:not(.is-loaded) {
      /* display: none; */
    }
  }
</style>
