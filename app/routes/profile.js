import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class extends Route {
  @service source;

  model({ username }) {
    return this.source
      .query(q =>
        q.findRecords('profile').filter({
          attribute: 'username',
          value: username
        })
      )
      .then(([profile]) => profile);
  }
}
