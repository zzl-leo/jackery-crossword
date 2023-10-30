<script>
  import Crossword from "../src/Crossword.svelte";
  import jac from './data/jackery.data.json'

</script>

<article>
  <section id="default">
    <Crossword data="{jac}" />
  </section>
</article>

<style>
  article {
    max-width: 988px;
    margin: 0 auto;
  }
  section {
    max-width: 100%;
    margin: 0 0;

    background-image: url(https://cdn.shopify.com/s/files/1/0970/9262/files/Group_538.png?v=1698649582);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center center;
  }

@media screen and (max-width: 1024px) {
  article {
    max-width: 94vw;
  }
  section {
    max-width: 100%;
    width: 342px;
    margin: 0 auto;
  }
}
</style>
