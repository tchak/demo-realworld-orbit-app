import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class extends Route {
  @service source;

  model({ slug }) {
    return this.source
      .query(q =>
        q.findRecords('article').filter({
          attribute: 'slug',
          value: slug
        })
      )
      .then(([article]) => article);
  }
}
